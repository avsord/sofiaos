/** Estado das conexoes de lojas do Price Tracker: o mesmo formato para todas. */
export type StoreConnection = {
  provider: 'mercadolivre' | 'aliexpress' | string;
  name: string;
  /** login = a pessoa entra na conta dela (OAuth); server = chave do Sofia no servidor, nada a fazer no app. */
  mode: 'login' | 'server';
  configured: boolean;
  connected: boolean;
  account: string;
  connected_at: string | null;
  error: string;
  redirect_uri?: string;
};
export type StoreConnectionsState = {stores: StoreConnection[]};
