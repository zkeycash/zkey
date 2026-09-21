export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      key_metrics: {
        Row: {
          fees_to_keys_sol: number
          fees_vault_sol: number
          id: number
          key_value_sol: number | null
          keys_outstanding: number
          mc_sol: number | null
          mc_usd: number | null
          updated_at: string
          volume_basis: string | null
          volume_usd: number | null
        }
        Insert: {
          fees_to_keys_sol?: number
          fees_vault_sol?: number
          id?: number
          key_value_sol?: number | null
          keys_outstanding?: number
          mc_sol?: number | null
          mc_usd?: number | null
          updated_at?: string
          volume_basis?: string | null
          volume_usd?: number | null
        }
        Update: {
          fees_to_keys_sol?: number
          fees_vault_sol?: number
          id?: number
          key_value_sol?: number | null
          keys_outstanding?: number
          mc_sol?: number | null
          mc_usd?: number | null
          updated_at?: string
          volume_basis?: string | null
          volume_usd?: number | null
        }
        Relationships: []
      }
      key_mints: {
        Row: {
          burn_tx: string | null
          created_at: string
          error: string | null
          id: string
          keys_minted: number
          minted_at: string | null
          nft_mints: string[]
          sol_wallet: string
          status: string
        }
        Insert: {
          burn_tx?: string | null
          created_at?: string
          error?: string | null
          id?: string
          keys_minted?: number
          minted_at?: string | null
          nft_mints?: string[]
          sol_wallet: string
          status?: string
        }
        Update: {
          burn_tx?: string | null
          created_at?: string
          error?: string | null
          id?: string
          keys_minted?: number
          minted_at?: string | null
          nft_mints?: string[]
          sol_wallet?: string
          status?: string
        }
        Relationships: []
      }
      redeem_requests: {
        Row: {
          burn_tx: string | null
          created_at: string
          error: string | null
          est_zec: number | null
          id: string
          key_value_sol: number | null
          keys_burned: number
          paid_at: string | null
          sol_wallet: string
          source: string
          status: string
          zec_address: string
          zec_txid: string | null
        }
        Insert: {
          burn_tx?: string | null
          created_at?: string
          error?: string | null
          est_zec?: number | null
          id?: string
          key_value_sol?: number | null
          keys_burned?: number
          paid_at?: string | null
          sol_wallet: string
          source?: string
          status?: string
          zec_address: string
          zec_txid?: string | null
        }
        Update: {
          burn_tx?: string | null
          created_at?: string
          error?: string | null
          est_zec?: number | null
          id?: string
          key_value_sol?: number | null
          keys_burned?: number
          paid_at?: string | null
          sol_wallet?: string
          source?: string
          status?: string
          zec_address?: string
          zec_txid?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_keys_outstanding: { Args: { n: number }; Returns: number }
      recalc_key_value: { Args: never; Returns: undefined }
      set_keys_outstanding: { Args: { n: number }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
