/**
 * Tipos do banco de dados Supabase (schema public).
 *
 * Escritos à mão a partir de supabase/migrations/ (Subetapa 3), no mesmo
 * formato gerado pelo comando oficial. Após criar o projeto, é possível
 * regenerá-los automaticamente:
 *
 *   npx supabase gen types typescript --project-id <ID-DO-PROJETO> > src/types/database.ts
 *
 * Mantenha este arquivo em sincronia sempre que uma migração mudar tabelas.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly'
export type SubscriptionStatus = 'pending' | 'active' | 'paused' | 'cancelled' | 'expired'
export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back'
export type PaymentProvider = 'mercadopago'

type Timestamps = { created_at: string; updated_at: string }

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          state: string | null
          city: string | null
          terms_accepted_at: string | null
        } & Timestamps
        Insert: never // criado apenas pelo trigger de cadastro
        Update: { full_name?: string; state?: string | null; city?: string | null }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          code: string
          name: string
          description: string
          price: number
          currency: string
          billing_period: BillingPeriod
          is_active: boolean
        } & Timestamps
        Insert: never
        Update: never
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string
          provider: PaymentProvider
          external_subscription_id: string | null
          status: SubscriptionStatus
          started_at: string | null
          expires_at: string | null
          provider_status: string | null
          next_payment_at: string | null
          cancelled_at: string | null
          checkout_url: string | null
        } & Timestamps
        Insert: never // somente Edge Functions
        Update: never
        Relationships: [
          { foreignKeyName: 'subscriptions_plan_id_fkey'; columns: ['plan_id']; isOneToOne: false; referencedRelation: 'plans'; referencedColumns: ['id'] },
          { foreignKeyName: 'subscriptions_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      payments: {
        Row: {
          id: string
          user_id: string | null
          subscription_id: string | null
          provider: PaymentProvider
          external_payment_id: string
          amount: number
          currency: string
          status: PaymentStatus
          status_detail: string | null
          paid_at: string | null
        } & Timestamps
        Insert: never // somente Edge Functions
        Update: never
        Relationships: [
          { foreignKeyName: 'payments_subscription_id_fkey'; columns: ['subscription_id']; isOneToOne: false; referencedRelation: 'subscriptions'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          state: string | null
          city: string | null
          interests: string[]
        } & Timestamps
        Insert: { user_id: string; state?: string | null; city?: string | null; interests?: string[] }
        Update: { state?: string | null; city?: string | null; interests?: string[] }
        Relationships: [
          { foreignKeyName: 'user_preferences_user_id_fkey'; columns: ['user_id']; isOneToOne: true; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      leads: {
        Row: {
          id: string
          name: string
          email: string
          state: string | null
          city: string | null
          source: string
        } & Timestamps
        Insert: never // usar a função capture_lead
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      capture_lead: {
        Args: { p_name: string; p_email: string; p_state?: string | null; p_city?: string | null }
        Returns: undefined
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type TableRow<T extends keyof PublicTables> = PublicTables[T]['Row']

export type Profile = TableRow<'profiles'>
export type PlanRow = TableRow<'plans'>
export type Subscription = TableRow<'subscriptions'>
export type Payment = TableRow<'payments'>
export type UserPreferences = TableRow<'user_preferences'>
