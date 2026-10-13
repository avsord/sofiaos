/** Backend-owned identity. The original source URL remains the history key. */
export type MercadoLivreIdentity = {provider: 'mercadolivre'; itemId: string; catalogProductId: string | null; identityKey: string; sellerId: string; sellerName: string; normalizedUrl: string; priceBasis: 'product_excluding_shipping'};
export type MercadoLivreReading = {provider: 'mercadolivre'; itemId: string; catalogProductId: string | null; identityKey: string; title: string; seller: {id: string; name: string}; normalizedUrl: string; amountCents: number; amount: number; currency: 'BRL'; observedAt: string; source: string; extras?: Record<string, unknown>};
export type MercadoLivreResponse = {ok: true; reading: MercadoLivreReading} | {ok: false; code: string; message: string; keepLastPrice: true; retryable?: boolean; needsUserAction?: boolean};
export type MercadoLivreOptions = {monitorId?: string; expectedSellerId?: string; allowCatalogWinner?: boolean; signal?: AbortSignal; /** Endereço salvo do anúncio (com vendedor fixado) para o celular baixar. */ fetchUrl?: string};
export type MercadoLivreApi = {readMercadoLivre: (link: string, options?: MercadoLivreOptions) => Promise<MercadoLivreResponse>};
