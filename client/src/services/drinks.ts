/* Autor: Marius Middrup / Julius Vollmer (FH Münster) */

import { DrinkGroup } from '../models/drinks.js';
import { fetchWithAuth } from '../utils/fetch.js';

export interface DrinkUpdateData {
  name?: string;
  price?: number;
  unit?: string;
  packaging?: 'Flasche' | 'Fass';
  groupId?: string;
  lowStockThreshold?: number;
  isBeer?: boolean;
}

class DrinkService {
  private readonly baseUrl = '/api/drinks';

  async getDrinks(): Promise<DrinkGroup[]> {
    const res = await fetchWithAuth(this.baseUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.drinks;
  }

  async addDrink(drink: {
    name: string;
    price: number;
    packaging: 'Flasche' | 'Fass';
    unit: string;
    groupId: string;
    quantityAdded: number;
    purchasePrice?: number;
    batchId?: string;
    lowStockThreshold?: number;
    isBeer?: boolean;
  }): Promise<void> {
    const res = await fetchWithAuth(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drink)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async updateDrink(id: string, data: DrinkUpdateData): Promise<void> {
    const res = await fetchWithAuth(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  }

  async deleteDrink(id: string): Promise<void> {
    const res = await fetchWithAuth(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async updateStock(id: string, stock: number): Promise<void> {
    const res = await fetchWithAuth(`${this.baseUrl}/${id}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  }
}

export const drinkService = new DrinkService();

export const restockService = {
  async restock(
    items: {
      name: string;
      salePrice: number;
      purchasePrice: number;
      packaging: 'Flasche' | 'Fass';
      unit: string;
      groupId: string;
      quantity: number;
    }[]
  ): Promise<void> {
    const batchId = crypto.randomUUID();
    for (const item of items) {
      await drinkService.addDrink({
        name: item.name,
        price: item.salePrice,
        packaging: item.packaging,
        unit: item.unit,
        groupId: item.groupId,
        quantityAdded: item.quantity,
        purchasePrice: item.purchasePrice,
        batchId
      });
    }
  }
};
