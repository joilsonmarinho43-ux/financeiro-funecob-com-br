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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      auto_settlement_allocations: {
        Row: {
          amount_applied: number
          created_at: string
          event_id: string
          id: string
          invoice_id: string
          organization_id: string
          was_generated: boolean
        }
        Insert: {
          amount_applied: number
          created_at?: string
          event_id: string
          id?: string
          invoice_id: string
          organization_id: string
          was_generated?: boolean
        }
        Update: {
          amount_applied?: number
          created_at?: string
          event_id?: string
          id?: string
          invoice_id?: string
          organization_id?: string
          was_generated?: boolean
        }
        Relationships: []
      }
      auto_settlement_credits: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          organization_id: string
          origin_event_id: string | null
          source: string
          status: string
          updated_at: string
          used_amount: number
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          organization_id: string
          origin_event_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          used_amount?: number
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          origin_event_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          used_amount?: number
        }
        Relationships: []
      }
      auto_settlement_events: {
        Row: {
          amount_detected: number | null
          client_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ocr_payload: Json | null
          organization_id: string
          phone: string
          pix_end_to_end_id: string | null
          processed_at: string | null
          raw_text: string | null
          status: string
          txid: string | null
          updated_at: string
          whatsapp_message_id: string | null
        }
        Insert: {
          amount_detected?: number | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ocr_payload?: Json | null
          organization_id: string
          phone: string
          pix_end_to_end_id?: string | null
          processed_at?: string | null
          raw_text?: string | null
          status?: string
          txid?: string | null
          updated_at?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          amount_detected?: number | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ocr_payload?: Json | null
          organization_id?: string
          phone?: string
          pix_end_to_end_id?: string | null
          processed_at?: string | null
          raw_text?: string | null
          status?: string
          txid?: string | null
          updated_at?: string
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      auto_settlement_logs: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          details: Json
          event_id: string | null
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string
          details?: Json
          event_id?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          details?: Json
          event_id?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      barcode_configs: {
        Row: {
          client_id_length: number
          created_at: string
          id: string
          month_length: number
          organization_id: string
          updated_at: string
          year_length: number
        }
        Insert: {
          client_id_length?: number
          created_at?: string
          id?: string
          month_length?: number
          organization_id: string
          updated_at?: string
          year_length?: number
        }
        Update: {
          client_id_length?: number
          created_at?: string
          id?: string
          month_length?: number
          organization_id?: string
          updated_at?: string
          year_length?: number
        }
        Relationships: [
          {
            foreignKeyName: "barcode_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_reminders: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          invoice_id: string
          organization_id: string
          reminder_date: string
          reminder_type: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id: string
          organization_id: string
          reminder_date?: string
          reminder_type: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string
          organization_id?: string
          reminder_date?: string
          reminder_type?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          billing_mode: string
          created_at: string
          gateway_api_key: string | null
          gateway_provider: string | null
          gateway_webhook_url: string | null
          id: string
          organization_id: string
          pix_holder_name: string | null
          pix_key: string | null
          pix_key_type: string | null
          reminder_days_after: number
          reminder_days_before: number
          reminder_days_before_2: number
          reminder_days_critical: number
          reminder_enabled: boolean
          template_baixa: string
          template_critical: string
          template_due_date: string
          template_overdue: string
          template_remarcar: string
          template_reminder: string
          template_retorno: string
          template_welcome: string
          updated_at: string
          welcome_enabled: boolean
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          gateway_api_key?: string | null
          gateway_provider?: string | null
          gateway_webhook_url?: string | null
          id?: string
          organization_id: string
          pix_holder_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          reminder_days_after?: number
          reminder_days_before?: number
          reminder_days_before_2?: number
          reminder_days_critical?: number
          reminder_enabled?: boolean
          template_baixa?: string
          template_critical?: string
          template_due_date?: string
          template_overdue?: string
          template_remarcar?: string
          template_reminder?: string
          template_retorno?: string
          template_welcome?: string
          updated_at?: string
          welcome_enabled?: boolean
        }
        Update: {
          billing_mode?: string
          created_at?: string
          gateway_api_key?: string | null
          gateway_provider?: string | null
          gateway_webhook_url?: string | null
          id?: string
          organization_id?: string
          pix_holder_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          reminder_days_after?: number
          reminder_days_before?: number
          reminder_days_before_2?: number
          reminder_days_critical?: number
          reminder_enabled?: boolean
          template_baixa?: string
          template_critical?: string
          template_due_date?: string
          template_overdue?: string
          template_remarcar?: string
          template_reminder?: string
          template_retorno?: string
          template_welcome?: string
          updated_at?: string
          welcome_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "billing_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      bips: {
        Row: {
          action: string
          amount: number | null
          barcode_raw: string
          client_id: string | null
          collector_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          new_due_date: string | null
          organization_id: string
          status: string
          whatsapp_sent: boolean
        }
        Insert: {
          action?: string
          amount?: number | null
          barcode_raw: string
          client_id?: string | null
          collector_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          new_due_date?: string | null
          organization_id: string
          status?: string
          whatsapp_sent?: boolean
        }
        Update: {
          action?: string
          amount?: number | null
          barcode_raw?: string
          client_id?: string | null
          collector_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          new_due_date?: string | null
          organization_id?: string
          status?: string
          whatsapp_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bips_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      client_portal_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          token?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          client_code: string | null
          collector_id: string | null
          consent_date: string | null
          consent_given: boolean
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          organization_id: string | null
          phone: string | null
          status: string
          temperature: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_code?: string | null
          collector_id?: string | null
          consent_date?: string | null
          consent_given?: boolean
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          organization_id?: string | null
          phone?: string | null
          status?: string
          temperature?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_code?: string | null
          collector_id?: string | null
          consent_date?: string | null
          consent_given?: boolean
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          phone?: string | null
          status?: string
          temperature?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      global_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          organization_id: string | null
          paid_date: string | null
          payment_link: string | null
          payment_link_external_id: string | null
          payment_link_provider: string | null
          plan_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          organization_id?: string | null
          paid_date?: string | null
          payment_link?: string | null
          payment_link_external_id?: string | null
          payment_link_provider?: string | null
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          organization_id?: string | null
          paid_date?: string | null
          payment_link?: string | null
          payment_link_external_id?: string | null
          payment_link_provider?: string | null
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      org_api_keys: {
        Row: {
          active: boolean
          api_key: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          active?: boolean
          api_key?: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          active?: boolean
          api_key?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          address: string | null
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          niche: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          niche?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          niche?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          billing_cycle: string
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_cycle?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_cycle?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurrence_audit_logs: {
        Row: {
          changed_at: string
          changed_by: string | null
          client_id: string | null
          details: Json | null
          id: string
          invoice_id: string | null
          new_due_date: string | null
          old_due_date: string | null
          organization_id: string | null
          original_due_day: number | null
          reason: string
          source: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          client_id?: string | null
          details?: Json | null
          id?: string
          invoice_id?: string | null
          new_due_date?: string | null
          old_due_date?: string | null
          organization_id?: string | null
          original_due_day?: number | null
          reason: string
          source?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          client_id?: string | null
          details?: Json | null
          id?: string
          invoice_id?: string | null
          new_due_date?: string | null
          old_due_date?: string | null
          organization_id?: string | null
          original_due_day?: number | null
          reason?: string
          source?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message: string
          organization_id: string | null
          phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          organization_id?: string | null
          phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          organization_id?: string | null
          phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          plan_type: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id: string
          plan_type?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          plan_type?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      system_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          organization_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invoice_id: string | null
          organization_id: string | null
          transaction_date: string
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          organization_id?: string | null
          transaction_date?: string
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          organization_id?: string | null
          transaction_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          last_triggered_at: string | null
          name: string
          organization_id: string
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          last_triggered_at?: string | null
          name: string
          organization_id: string
          secret?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          last_triggered_at?: string | null
          name?: string
          organization_id?: string
          secret?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          event: string
          id: string
          organization_id: string | null
          payload: Json | null
          response_body: string | null
          response_status: number | null
          webhook_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          organization_id?: string | null
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          organization_id?: string | null
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          created_at: string
          failed_count: number
          id: string
          max_delay: number
          message: string
          min_delay: number
          name: string
          organization_id: string | null
          scheduled_at: string | null
          sent_count: number
          status: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_count?: number
          id?: string
          max_delay?: number
          message: string
          min_delay?: number
          name: string
          organization_id?: string | null
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_count?: number
          id?: string
          max_delay?: number
          message?: string
          min_delay?: number
          name?: string
          organization_id?: string | null
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_key: string | null
          api_url: string | null
          collector_id: string | null
          created_at: string
          id: string
          name: string
          organization_id: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          collector_id?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          collector_id?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          client_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          id: string
          instance_id: string | null
          message: string
          organization_id: string | null
          phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: string
          instance_id?: string | null
          message: string
          organization_id?: string | null
          phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: string
          instance_id?: string | null
          message?: string
          organization_id?: string | null
          phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      whatsapp_queue: {
        Row: {
          campaign_id: string | null
          created_at: string
          error_message: string | null
          id: string
          message: string
          organization_id: string | null
          phone: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          organization_id?: string | null
          phone: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          organization_id?: string | null
          phone?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      whatsapp_send_config: {
        Row: {
          auto_pause_enabled: boolean
          created_at: string
          id: string
          max_delay: number
          max_per_day: number
          max_per_hour: number
          max_per_minute: number
          min_delay: number
          organization_id: string
          randomness_level: string
          send_window_end: string
          send_window_start: string
          shuffle_order: boolean
          updated_at: string
        }
        Insert: {
          auto_pause_enabled?: boolean
          created_at?: string
          id?: string
          max_delay?: number
          max_per_day?: number
          max_per_hour?: number
          max_per_minute?: number
          min_delay?: number
          organization_id: string
          randomness_level?: string
          send_window_end?: string
          send_window_start?: string
          shuffle_order?: boolean
          updated_at?: string
        }
        Update: {
          auto_pause_enabled?: boolean
          created_at?: string
          id?: string
          max_delay?: number
          max_per_day?: number
          max_per_hour?: number
          max_per_minute?: number
          min_delay?: number
          organization_id?: string
          randomness_level?: string
          send_window_end?: string
          send_window_start?: string
          shuffle_order?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_send_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_send_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "system_health_metrics"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Views: {
      system_health_metrics: {
        Row: {
          amount_open: number | null
          amount_overdue: number | null
          clients_active: number | null
          credit_balance_available: number | null
          invoices_open: number | null
          invoices_overdue: number | null
          invoices_paid_30d: number | null
          organization_id: string | null
          organization_name: string | null
          settlement_errors_total: number | null
          settlement_ok_30d: number | null
          wa_failed_24h: number | null
          wa_instances_connected: number | null
          wa_messages_24h: number | null
          wa_queue_pending: number | null
        }
        Insert: {
          amount_open?: never
          amount_overdue?: never
          clients_active?: never
          credit_balance_available?: never
          invoices_open?: never
          invoices_overdue?: never
          invoices_paid_30d?: never
          organization_id?: string | null
          organization_name?: string | null
          settlement_errors_total?: never
          settlement_ok_30d?: never
          wa_failed_24h?: never
          wa_instances_connected?: never
          wa_messages_24h?: never
          wa_queue_pending?: never
        }
        Update: {
          amount_open?: never
          amount_overdue?: never
          clients_active?: never
          credit_balance_available?: never
          invoices_open?: never
          invoices_overdue?: never
          invoices_paid_30d?: never
          organization_id?: string | null
          organization_name?: string | null
          settlement_errors_total?: never
          settlement_ok_30d?: never
          wa_failed_24h?: never
          wa_instances_connected?: never
          wa_messages_24h?: never
          wa_queue_pending?: never
        }
        Relationships: []
      }
    }
    Functions: {
      audit_recurrence_integrity: {
        Args: { p_organization_id?: string }
        Returns: Json
      }
      auto_settlement_process_payment: {
        Args: { p_event_id: string }
        Returns: Json
      }
      client_original_due_day: {
        Args: { p_client_id: string }
        Returns: number
      }
      generate_next_recurrence: {
        Args: { p_paid_invoice_id: string; p_user_id?: string }
        Returns: Json
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_collector: { Args: { _user_id: string }; Returns: boolean }
      perform_baixa_manual: {
        Args: {
          p_invoice_id: string
          p_organization_id: string
          p_paid_date: string
          p_user_id: string
        }
        Returns: Json
      }
      rebuild_client_recurrence: {
        Args: { p_client_id: string; p_dry_run?: boolean; p_until?: string }
        Returns: Json
      }
      repair_client_due_dates: {
        Args: { p_dry_run?: boolean; p_organization_id?: string }
        Returns: Json
      }
      rollback_due_date_change: {
        Args: { p_audit_log_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
