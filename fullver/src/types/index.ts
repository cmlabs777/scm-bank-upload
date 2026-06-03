export type Role = "admin" | "user";
export type FortuneSlot = "me" | "partner";
export type CalendarType = "solar" | "lunar";
export type Gender = "male" | "female" | "unspecified";

export interface User {
  id: number;
  email: string;
  role: Role;
  created_at: string;
}

export interface TransactionType {
  id: number;
  name: string;
  kind: "income" | "expense";
}

export interface ClassificationRule {
  id: number;
  keyword: string;
  kind: "income" | "expense";
  type_name: string;
  description: string;
}

export interface Transaction {
  id: number;
  kind: "income" | "expense";
  month: string;
  traded_at: string;
  amount: number;
  type_name: string;
  note: string;
  upload_key: string;
  created_at: string;
}

export interface Investment {
  id: number;
  kind: string;
  category: string;
  product: string;
  traded_at: string;
  unit_price: number;
  quantity: number;
  amount: number;
  fee: number;
  return_rate: number;
  note: string;
  created_at: string;
}

export interface MonthlyReport {
  month: string;
  income: number;
  expense: number;
  net: number;
  expenseByType: Record<string, number>;
  incomeByType: Record<string, number>;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

export interface FortuneProfile {
  slot: FortuneSlot;
  display_name: string;
  birth_date: string | null;
  birth_time: string | null;
  calendar_type: CalendarType;
  gender: Gender;
  enabled: boolean;
  updated_at?: string;
}
