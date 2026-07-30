// Low-level bridge wrapper, copied from qortium-notify's qdnRequest.ts.
// Paint only talks to Home itself (account, publish, feature/UI detection),
// so the bridge surface here stays deliberately small. Higher-level Paint
// concerns live in src/qdn/api.ts.

export type QdnAction = string;

export type BridgeState = {
  actions: QdnAction[];
  isHomeBridge: boolean;
  ui: string;
};

export const LOCAL_READ_ACTIONS = ['SHOW_ACTIONS', 'WHICH_UI'] as const;

type QdnRequest = {
  action: string;
  [key: string]: unknown;
};

export function hasHomeBridge() {
  return typeof window !== 'undefined' && typeof window.qdnRequest === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function fallbackQdnRequest<T>(request: QdnRequest): Promise<T> {
  switch (request.action.toUpperCase()) {
    case 'SHOW_ACTIONS':
      return [...LOCAL_READ_ACTIONS] as T;
    case 'WHICH_UI':
      return 'BROWSER_DEV' as T;
    default:
      throw new Error(`${request.action} requires Qortium Home; it is not available in local browser development.`);
  }
}

export async function qdnRequest<T = unknown>(request: QdnRequest): Promise<T> {
  if (!isRecord(request) || typeof request.action !== 'string') {
    throw new Error('QDN requests must include an action.');
  }

  const bridgeRequest = typeof window !== 'undefined' ? window.qdnRequest : undefined;

  if (typeof bridgeRequest === 'function') {
    return bridgeRequest<T>(request);
  }

  return fallbackQdnRequest<T>(request);
}

export async function getBridgeState(): Promise<BridgeState> {
  let actions: QdnAction[] = [];
  const ui = hasHomeBridge() ? 'QORTIUM_HOME' : 'BROWSER_DEV';

  try {
    const requestedActions = await qdnRequest<unknown>({ action: 'SHOW_ACTIONS' });

    actions = Array.isArray(requestedActions)
      ? requestedActions.filter((action): action is QdnAction => typeof action === 'string')
      : [];
  } catch {
    actions = [...LOCAL_READ_ACTIONS];
  }

  return {
    actions,
    isHomeBridge: hasHomeBridge(),
    ui,
  };
}

export function hasAction(actions: QdnAction[], ...candidates: string[]) {
  const actionSet = new Set(actions.map((action) => action.toUpperCase()));

  return candidates.some((candidate) => actionSet.has(candidate.toUpperCase()));
}

export type QdnBridgeError = Error & { code?: string };

export function getBridgeErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

export function isStaleRevisionError(error: unknown): boolean {
  return getBridgeErrorCode(error) === 'HOME_DATA_STALE';
}
