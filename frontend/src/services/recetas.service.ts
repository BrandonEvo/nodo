import api from '@/lib/api';

export interface RecipeIngredientRead {
  id: string;
  inventory_item_id: string;
  item_name: string;
  item_unit: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

export interface Recipe {
  id: string;
  tenant_id: string;
  name: string;
  base_unit: string;
  estimated_yield: number;
  estimated_cost: number;
  sell_price: number;
  description: string | null;
  instructions: string | null;
  bake_temp: number | null;
  bake_time: number | null;
  difficulty: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredientRead[];
}

export interface RecipeCreate {
  name: string;
  base_unit?: string;
  estimated_yield?: number;
  sell_price?: number;
  description?: string | null;
  instructions?: string | null;
  bake_temp?: number | null;
  bake_time?: number | null;
  difficulty?: string | null;
  icon?: string | null;
}

export interface RecipeIngredientCreate {
  inventory_item_id: string;
  quantity: number;
}

const BASE = '/api/recetas';

export const recetasService = {
  list: async (): Promise<Recipe[]> => {
    const { data } = await api.get(`${BASE}/`);
    return data;
  },

  create: async (body: RecipeCreate): Promise<Recipe> => {
    const { data } = await api.post(`${BASE}/`, body);
    return data;
  },

  getWithIngredients: async (id: string): Promise<RecipeWithIngredients> => {
    const { data } = await api.get(`${BASE}/${id}`);
    return data;
  },

  update: async (id: string, body: Partial<RecipeCreate>): Promise<Recipe> => {
    const { data } = await api.patch(`${BASE}/${id}`, body);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },

  addIngredient: async (recipeId: string, body: RecipeIngredientCreate): Promise<RecipeIngredientRead> => {
    const { data } = await api.post(`${BASE}/${recipeId}/ingredients`, body);
    return data;
  },

  updateIngredient: async (recipeId: string, ingredientId: string, body: RecipeIngredientCreate): Promise<RecipeIngredientRead> => {
    const { data } = await api.patch(`${BASE}/${recipeId}/ingredients/${ingredientId}`, body);
    return data;
  },

  removeIngredient: async (recipeId: string, ingredientId: string): Promise<void> => {
    await api.delete(`${BASE}/${recipeId}/ingredients/${ingredientId}`);
  },
};
