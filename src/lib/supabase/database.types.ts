
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "articles": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"name": string,"search_text": string | null,"tenant_id": string,"unit": string,"unit_price_gross": number,"updated_at": string,"vat_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name": string,"search_text"?: never,"tenant_id": string,"unit"?: string,"unit_price_gross": number,"updated_at"?: string,"vat_rate": number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name"?: string,"search_text"?: never,"tenant_id"?: string,"unit"?: string,"unit_price_gross"?: number,"updated_at"?: string,"vat_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "articles_tenant_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "archived_at": string | null,"city": string,"contact_person": string | null,"country_code": string,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"name": string,"notes": string | null,"postal_code": string,"search_text": string | null,"street": string,"tenant_id": string,"updated_at": string,"vat_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"city"?: string,"contact_person"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"postal_code"?: string,"search_text"?: never,"street"?: string,"tenant_id": string,"updated_at"?: string,"vat_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"city"?: string,"contact_person"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"postal_code"?: string,"search_text"?: never,"street"?: string,"tenant_id"?: string,"updated_at"?: string,"vat_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_tenant_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_exports": {
                  Row: {
                    "created_at": string,"created_by": string | null,"filename": string,"id": string,"invoice_id": string,"storage_path": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"filename": string,"id"?: string,"invoice_id": string,"storage_path": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"filename"?: string,"id"?: string,"invoice_id"?: string,"storage_path"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_exports_invoice_fkey"
      columns: ["invoice_id","tenant_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invoice_exports_tenant_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_items": {
                  Row: {
                    "article_id": string | null,"description": string,"id": string,"invoice_id": string,"position": number,"quantity": number,"tenant_id": string,"unit": string,"unit_price_gross": number,"vat_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id"?: string | null,"description": string,"id"?: string,"invoice_id": string,"position": number,"quantity": number,"tenant_id": string,"unit"?: string,"unit_price_gross": number,"vat_rate": number
                  }
                  Update: {
                    "article_id"?: string | null,"description"?: string,"id"?: string,"invoice_id"?: string,"position"?: number,"quantity"?: number,"tenant_id"?: string,"unit"?: string,"unit_price_gross"?: number,"vat_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_items_article_fkey"
      columns: ["article_id","tenant_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invoice_items_invoice_fkey"
      columns: ["invoice_id","tenant_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invoice_items_tenant_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "closing_text": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"due_date": string | null,"id": string,"intro_text": string | null,"issue_date": string,"number": string,"payment_days": number | null,"recipient": NonNullable<Json>,"search_text": string | null,"service_date_from": string,"service_date_to": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closing_text"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"due_date"?: never,"id"?: string,"intro_text"?: string | null,"issue_date"?: string,"number": string,"payment_days"?: number | null,"recipient": NonNullable<Json>,"search_text"?: never,"service_date_from": string,"service_date_to"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "closing_text"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"due_date"?: never,"id"?: string,"intro_text"?: string | null,"issue_date"?: string,"number"?: string,"payment_days"?: number | null,"recipient"?: NonNullable<Json>,"search_text"?: never,"service_date_from"?: string,"service_date_to"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_customer_fkey"
      columns: ["customer_id","tenant_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invoices_tenant_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "company": NonNullable<Json>,"default_payment_days": number | null,"filename_template": string,"number_format": string | null,"tenant_id": string,"theme": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company"?: NonNullable<Json>,"default_payment_days"?: number | null,"filename_template"?: string,"number_format"?: string | null,"tenant_id": string,"theme"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "company"?: NonNullable<Json>,"default_payment_days"?: number | null,"filename_template"?: string,"number_format"?: string | null,"tenant_id"?: string,"theme"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settings_tenant_fkey"
      columns: ["tenant_id"]
isOneToOne: true
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_tenant":
{ Args: { "p_name": string }; Returns: string
                           },
"save_invoice":
{ Args: { "p_id": string,"p_invoice": Json,"p_items": Json,"p_tenant_id": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
