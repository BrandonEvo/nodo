import api from '@/lib/api';

export interface AmazonProduct {
  asin: string;
  name: string | null;
  price_usd: number | null;
  image_url: string | null;
  url: string;
  description: string | null;
}

export const shopperAmazonService = {
  scrape: (url: string): Promise<AmazonProduct> =>
    api.post('/api/amazon/scrape', { url }).then(r => r.data),
};
