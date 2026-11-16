/* Autor: Marius Middrup (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

export interface OrderRequest {
  id: string;
  value: number;
}

export interface TallyRequest {
  userId?: string; // leer = auf das eigene Konto
  items: OrderRequest[];
}
