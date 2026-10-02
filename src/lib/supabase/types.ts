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
      account_fingerprints: {
        Row: { payment_fingerprint: string | null; profile_id: string; updated_at: string }
        Insert: { payment_fingerprint?: string | null; profile_id: string; updated_at?: string }
        Update: { payment_fingerprint?: string | null; profile_id?: string; updated_at?: string }
        Relationships: [
          {
            foreignKeyName: "account_fingerprints_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      award_prediction_options: {
        Row: {
          id: string
          label: string
          prediction_id: string
          sort_order: number
          uei: string | null
        }
        Insert: {
          id?: string
          label: string
          prediction_id: string
          sort_order?: number
          uei?: string | null
        }
        Update: {
          id?: string
          label?: string
          prediction_id?: string
          sort_order?: number
          uei?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_prediction_options_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "award_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      award_prediction_picks: {
        Row: {
          created_at: string
          option_id: string
          prediction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          prediction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          prediction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_prediction_picks_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "award_prediction_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_prediction_picks_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "award_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      award_prediction_seasons: {
        Row: {
          finalized_at: string
          season_id: string
          top_correct: number
          winner_ids: string[]
        }
        Insert: {
          finalized_at?: string
          season_id: string
          top_correct?: number
          winner_ids?: string[]
        }
        Update: {
          finalized_at?: string
          season_id?: string
          top_correct?: number
          winner_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "award_prediction_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      award_predictions: {
        Row: {
          agency: string | null
          award_data: Json | null
          award_number: string | null
          created_at: string
          created_by: string | null
          details: string | null
          estimated_value: string | null
          expected_award_date: string
          id: string
          opportunity_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          season_id: string
          solicitation_number: string | null
          sort_order: number
          status: string
          title: string
          void_reason: string | null
          winner_option_id: string | null
        }
        Insert: {
          agency?: string | null
          award_data?: Json | null
          award_number?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          estimated_value?: string | null
          expected_award_date: string
          id?: string
          opportunity_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          season_id: string
          solicitation_number?: string | null
          sort_order?: number
          status?: string
          title: string
          void_reason?: string | null
          winner_option_id?: string | null
        }
        Update: {
          agency?: string | null
          award_data?: Json | null
          award_number?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          estimated_value?: string | null
          expected_award_date?: string
          id?: string
          opportunity_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          season_id?: string
          solicitation_number?: string | null
          sort_order?: number
          status?: string
          title?: string
          void_reason?: string | null
          winner_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_predictions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_predictions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_predictions_winner_fk"
            columns: ["winner_option_id"]
            isOneToOne: false
            referencedRelation: "award_prediction_options"
            referencedColumns: ["id"]
          },
        ]
      }
      company_leaderboard_months: {
        Row: {
          finalized_at: string
          month: string
        }
        Insert: {
          finalized_at?: string
          month: string
        }
        Update: {
          finalized_at?: string
          month?: string
        }
        Relationships: []
      }
      company_leaderboard_prizes: {
        Row: {
          credits_per_employee: number
          rank: number
          top_badge: boolean
        }
        Insert: {
          credits_per_employee?: number
          rank: number
          top_badge?: boolean
        }
        Update: {
          credits_per_employee?: number
          rank?: number
          top_badge?: boolean
        }
        Relationships: []
      }
      contract_wins: {
        Row: {
          agency: string
          amount: number | null
          author_id: string
          award_data: Json | null
          award_date: string | null
          award_key: string
          award_number: string
          awardee: string
          created_at: string
          details: string | null
          id: string
          naics_code: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          set_aside: string | null
          status: string
          title: string
        }
        Insert: {
          agency: string
          amount?: number | null
          author_id: string
          award_data?: Json | null
          award_date?: string | null
          award_number: string
          awardee: string
          created_at?: string
          details?: string | null
          id?: string
          naics_code?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          set_aside?: string | null
          status?: string
          title: string
        }
        Update: {
          agency?: string
          amount?: number | null
          author_id?: string
          award_data?: Json | null
          award_date?: string | null
          award_number?: string
          awardee?: string
          created_at?: string
          details?: string | null
          id?: string
          naics_code?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          set_aside?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_wins_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          active: boolean
          category: string
          code: string
          credits: number
          description: string | null
          family: string
          hidden: boolean
          icon: string
          id: string
          manual: boolean
          metric: string | null
          name: string
          per_community: boolean
          sort_order: number
          threshold: number | null
          tier: string
        }
        Insert: {
          active?: boolean
          category: string
          code: string
          credits?: number
          description?: string | null
          family: string
          hidden?: boolean
          icon?: string
          id?: string
          manual?: boolean
          metric?: string | null
          name: string
          per_community?: boolean
          sort_order?: number
          threshold?: number | null
          tier?: string
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          credits?: number
          description?: string | null
          family?: string
          hidden?: boolean
          icon?: string
          id?: string
          manual?: boolean
          metric?: string | null
          name?: string
          per_community?: boolean
          sort_order?: number
          threshold?: number | null
          tier?: string
        }
        Relationships: []
      }
      best_answer_nominations: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          nominator_id: string
          post_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          nominator_id: string
          post_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          nominator_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_answer_nominations_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_answer_nominations_nominator_id_fkey"
            columns: ["nominator_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_answer_nominations_nominator_id_fkey"
            columns: ["nominator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_answer_nominations_nominator_id_fkey"
            columns: ["nominator_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_answer_nominations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_templates: {
        Row: {
          active: boolean
          code: string
          credits: number
          description: string | null
          id: string
          requirements: Json
          sort_order: number
          title: string
          xp: number
        }
        Insert: {
          active?: boolean
          code: string
          credits?: number
          description?: string | null
          id?: string
          requirements: Json
          sort_order?: number
          title: string
          xp?: number
        }
        Update: {
          active?: boolean
          code?: string
          credits?: number
          description?: string | null
          id?: string
          requirements?: Json
          sort_order?: number
          title?: string
          xp?: number
        }
        Relationships: []
      }
      challenges: {
        Row: {
          created_at: string
          credits: number
          description: string | null
          ends_at: string
          id: string
          requirements: Json
          season_id: string | null
          starts_at: string
          template_id: string | null
          title: string
          xp: number
        }
        Insert: {
          created_at?: string
          credits?: number
          description?: string | null
          ends_at: string
          id?: string
          requirements: Json
          season_id?: string | null
          starts_at: string
          template_id?: string | null
          title: string
          xp?: number
        }
        Update: {
          created_at?: string
          credits?: number
          description?: string | null
          ends_at?: string
          id?: string
          requirements?: Json
          season_id?: string | null
          starts_at?: string
          template_id?: string | null
          title?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_season_fk"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "challenge_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_edit_history: {
        Row: {
          comment_id: string
          edited_at: string
          editor_profile_id: string
          id: string
          previous_body: string
        }
        Insert: {
          comment_id: string
          edited_at?: string
          editor_profile_id: string
          id?: string
          previous_body: string
        }
        Update: {
          comment_id?: string
          edited_at?: string
          editor_profile_id?: string
          id?: string
          previous_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_edit_history_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edit_history_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edit_history_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edit_history_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_follows: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_follows_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          profile_id: string
          value: number
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          profile_id: string
          value?: number
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_saves: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_saves_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          archived_at: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string
          featured: boolean
          id: string
          member_count: number
          membership_policy: string
          name: string
          post_count: number
          rules: string | null
          scheduled_at: string | null
          slug: string
          sort_order: number
          status: string
          topic: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          featured?: boolean
          id?: string
          member_count?: number
          membership_policy?: string
          name: string
          post_count?: number
          rules?: string | null
          scheduled_at?: string | null
          slug: string
          sort_order?: number
          status?: string
          topic?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          featured?: boolean
          id?: string
          member_count?: number
          membership_policy?: string
          name?: string
          post_count?: number
          rules?: string | null
          scheduled_at?: string | null
          slug?: string
          sort_order?: number
          status?: string
          topic?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_favorites: {
        Row: {
          community_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_favorites_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_invites: {
        Row: {
          community_id: string
          created_at: string
          id: string
          invited_by: string
          invited_profile_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          invited_by: string
          invited_profile_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          invited_by?: string
          invited_profile_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_invites_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          profile_id: string
          role: string
          status: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role?: string
          status?: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          agencies_served: string[]
          archived_at: string | null
          business_email: string | null
          business_email_verified_at: string | null
          cage_code: string | null
          capabilities: string
          certifications: string
          company_size: string | null
          contract_vehicles: string[]
          contract_vehicles_note: string | null
          core_specialties: string | null
          cover_image_url: string | null
          created_at: string
          deletion_reason: string | null
          deletion_requested_at: string | null
          deletion_requested_by: string | null
          duns_number: string | null
          duplicate_of_company_id: string | null
          featured: boolean
          id: string
          is_partner: boolean
          keywords: string[]
          legal_name: string | null
          location: string
          logo_initials: string
          logo_url: string | null
          naics_codes: string[]
          name: string
          overview: string | null
          ownership: string | null
          partner_category: string | null
          partner_since: string | null
          partner_type: string | null
          phone: string | null
          psc_codes: string[]
          review_note: string | null
          scheduled_at: string | null
          service_areas: string[]
          services: string[]
          slug: string
          sort_order: number
          status: string
          submitted_by: string | null
          summary: string
          tagline: string | null
          tags: string[]
          type: string
          uei: string | null
          updated_at: string
          verification_note: string | null
          verification_proof_path: string | null
          verification_review_note: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string
          verification_submitted_at: string | null
          verification_submitted_by: string | null
          verified: boolean
          website: string | null
          year_founded: number | null
        }
        Insert: {
          agencies_served?: string[]
          archived_at?: string | null
          business_email?: string | null
          business_email_verified_at?: string | null
          cage_code?: string | null
          capabilities: string
          certifications: string
          company_size?: string | null
          contract_vehicles?: string[]
          contract_vehicles_note?: string | null
          core_specialties?: string | null
          cover_image_url?: string | null
          created_at?: string
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          duns_number?: string | null
          duplicate_of_company_id?: string | null
          featured?: boolean
          id?: string
          is_partner?: boolean
          keywords?: string[]
          legal_name?: string | null
          location: string
          logo_initials: string
          logo_url?: string | null
          naics_codes?: string[]
          name: string
          overview?: string | null
          ownership?: string | null
          partner_category?: string | null
          partner_since?: string | null
          partner_type?: string | null
          phone?: string | null
          psc_codes?: string[]
          review_note?: string | null
          scheduled_at?: string | null
          service_areas?: string[]
          services?: string[]
          slug: string
          sort_order?: number
          status?: string
          submitted_by?: string | null
          summary: string
          tagline?: string | null
          tags?: string[]
          type: string
          uei?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_proof_path?: string | null
          verification_review_note?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string
          verification_submitted_at?: string | null
          verification_submitted_by?: string | null
          verified?: boolean
          website?: string | null
          year_founded?: number | null
        }
        Update: {
          agencies_served?: string[]
          archived_at?: string | null
          business_email?: string | null
          business_email_verified_at?: string | null
          cage_code?: string | null
          capabilities?: string
          certifications?: string
          company_size?: string | null
          contract_vehicles?: string[]
          contract_vehicles_note?: string | null
          core_specialties?: string | null
          cover_image_url?: string | null
          created_at?: string
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          duns_number?: string | null
          duplicate_of_company_id?: string | null
          featured?: boolean
          id?: string
          is_partner?: boolean
          keywords?: string[]
          legal_name?: string | null
          location?: string
          logo_initials?: string
          logo_url?: string | null
          naics_codes?: string[]
          name?: string
          overview?: string | null
          ownership?: string | null
          partner_category?: string | null
          partner_since?: string | null
          partner_type?: string | null
          phone?: string | null
          psc_codes?: string[]
          review_note?: string | null
          scheduled_at?: string | null
          service_areas?: string[]
          services?: string[]
          slug?: string
          sort_order?: number
          status?: string
          submitted_by?: string | null
          summary?: string
          tagline?: string | null
          tags?: string[]
          type?: string
          uei?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_proof_path?: string | null
          verification_review_note?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string
          verification_submitted_at?: string | null
          verification_submitted_by?: string | null
          verified?: boolean
          website?: string | null
          year_founded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_duplicate_of_company_id_fkey"
            columns: ["duplicate_of_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verification_reviewed_by_fkey"
            columns: ["verification_reviewed_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verification_reviewed_by_fkey"
            columns: ["verification_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verification_reviewed_by_fkey"
            columns: ["verification_reviewed_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verification_submitted_by_fkey"
            columns: ["verification_submitted_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verification_submitted_by_fkey"
            columns: ["verification_submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verification_submitted_by_fkey"
            columns: ["verification_submitted_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_admins: {
        Row: {
          company_id: string
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          profile_id: string
          role?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_admins_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_certifications: {
        Row: {
          cert_type: string
          company_id: string
          created_at: string
          custom_label: string | null
          evidence_url: string | null
          expires_on: string | null
          id: string
          lapse_reason: string | null
          lapsed_at: string | null
          last_checked_at: string | null
          request_note: string | null
          requested_at: string | null
          requested_by: string | null
          reverify_due_on: string | null
          reverify_notified_at: string | null
          reverify_requested_at: string | null
          review_note: string | null
          sam_check: Json | null
          source_note: string | null
          status: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          cert_type: string
          company_id: string
          created_at?: string
          custom_label?: string | null
          evidence_url?: string | null
          expires_on?: string | null
          id?: string
          lapse_reason?: string | null
          lapsed_at?: string | null
          last_checked_at?: string | null
          request_note?: string | null
          requested_at?: string | null
          requested_by?: string | null
          reverify_due_on?: string | null
          reverify_notified_at?: string | null
          reverify_requested_at?: string | null
          review_note?: string | null
          sam_check?: Json | null
          source_note?: string | null
          status?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          cert_type?: string
          company_id?: string
          created_at?: string
          custom_label?: string | null
          evidence_url?: string | null
          expires_on?: string | null
          id?: string
          lapse_reason?: string | null
          lapsed_at?: string | null
          last_checked_at?: string | null
          request_note?: string | null
          requested_at?: string | null
          requested_by?: string | null
          reverify_due_on?: string | null
          reverify_notified_at?: string | null
          reverify_requested_at?: string | null
          review_note?: string | null
          sam_check?: Json | null
          source_note?: string | null
          status?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_certifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_certifications_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_certifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_public: boolean
          name: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_email_verifications: {
        Row: {
          company_id: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          token_hash: string
        }
        Insert: {
          company_id: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          token_hash: string
        }
        Update: {
          company_id?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_email_verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_email_verifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_email_verifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_email_verifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_follows: {
        Row: {
          company_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_follows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_leaderboard_results: {
        Row: {
          active_employees: number
          company_id: string
          month: string
          rank: number
          score: number
          verified_employees: number
        }
        Insert: {
          active_employees: number
          company_id: string
          month: string
          rank: number
          score: number
          verified_employees: number
        }
        Update: {
          active_employees?: number
          company_id?: string
          month?: string
          rank?: number
          score?: number
          verified_employees?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_leaderboard_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_leaderboard_results_month_fkey"
            columns: ["month"]
            isOneToOne: false
            referencedRelation: "company_leaderboard_months"
            referencedColumns: ["month"]
          },
        ]
      }
      company_past_performance: {
        Row: {
          attachment_storage_path: string | null
          company_id: string
          confidential_notes: string | null
          contract_number: string | null
          created_at: string
          customer_agency: string
          id: string
          is_ongoing: boolean
          location: string | null
          naics_codes: string[]
          outcomes: string | null
          period_end: string | null
          period_start: string | null
          psc_codes: string[]
          references_text: string | null
          role: string
          scope: string | null
          sort_order: number
          status: string
          technologies: string[]
          title: string
          updated_at: string
          value_display: string | null
        }
        Insert: {
          attachment_storage_path?: string | null
          company_id: string
          confidential_notes?: string | null
          contract_number?: string | null
          created_at?: string
          customer_agency: string
          id?: string
          is_ongoing?: boolean
          location?: string | null
          naics_codes?: string[]
          outcomes?: string | null
          period_end?: string | null
          period_start?: string | null
          psc_codes?: string[]
          references_text?: string | null
          role: string
          scope?: string | null
          sort_order?: number
          status?: string
          technologies?: string[]
          title: string
          updated_at?: string
          value_display?: string | null
        }
        Update: {
          attachment_storage_path?: string | null
          company_id?: string
          confidential_notes?: string | null
          contract_number?: string | null
          created_at?: string
          customer_agency?: string
          id?: string
          is_ongoing?: boolean
          location?: string | null
          naics_codes?: string[]
          outcomes?: string | null
          period_end?: string | null
          period_start?: string | null
          psc_codes?: string[]
          references_text?: string | null
          role?: string
          scope?: string | null
          sort_order?: number
          status?: string
          technologies?: string[]
          title?: string
          updated_at?: string
          value_display?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_past_performance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_reports: {
        Row: {
          company_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_reviews: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          rating: number
          relationship: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
          reviewer_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          rating: number
          relationship: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          reviewer_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          rating?: number
          relationship?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          reviewer_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reviews_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reviews_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reviews_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_views: {
        Row: {
          company_id: string
          created_at: string
          id: string
          viewer_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          viewer_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          member_one_id: string
          member_two_id: string
          requested_by: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          member_one_id: string
          member_two_id: string
          requested_by: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          member_one_id?: string
          member_two_id?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_member_one_id_fkey"
            columns: ["member_one_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_member_one_id_fkey"
            columns: ["member_one_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_member_one_id_fkey"
            columns: ["member_one_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_member_two_id_fkey"
            columns: ["member_two_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_member_two_id_fkey"
            columns: ["member_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_member_two_id_fkey"
            columns: ["member_two_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          submitted_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          submitted_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_messages_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_messages_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          member_one_id: string
          member_two_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          member_one_id: string
          member_two_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          member_one_id?: string
          member_two_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_one_id_fkey"
            columns: ["member_one_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_one_id_fkey"
            columns: ["member_one_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_one_id_fkey"
            columns: ["member_one_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_two_id_fkey"
            columns: ["member_two_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_two_id_fkey"
            columns: ["member_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_two_id_fkey"
            columns: ["member_two_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_feed_communities: {
        Row: {
          community_id: string
          created_at: string
          feed_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          feed_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          feed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_feed_communities_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_feed_communities_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "custom_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_feeds: {
        Row: {
          created_at: string
          id: string
          name: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_feeds_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_feeds_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_feeds_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_question_options: {
        Row: {
          id: string
          label: string
          question_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          label: string
          question_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          label?: string
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "daily_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_question_votes: {
        Row: {
          created_at: string
          option_id: string
          profile_id: string
          question_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          profile_id: string
          question_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          profile_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_question_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "daily_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_questions: {
        Row: {
          created_at: string
          day: string | null
          id: string
          question: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_by: string | null
        }
        Insert: {
          created_at?: string
          day?: string | null
          id?: string
          question: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string | null
        }
        Update: {
          created_at?: string
          day?: string | null
          id?: string
          question?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_questions_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      double_xp_hours: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          source: string
          starts_at: string
          week_start: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          source?: string
          starts_at: string
          week_start?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          source?: string
          starts_at?: string
          week_start?: string | null
        }
        Relationships: []
      }
      digest_email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          kind: string
          period_key: string
          post_ids: string[]
          profile_id: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          period_key: string
          post_ids?: string[]
          profile_id: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          period_key?: string
          post_ids?: string[]
          profile_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digest_email_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_saves: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      education_records: {
        Row: {
          activities: string | null
          created_at: string
          degree: string | null
          description: string | null
          end_label: string
          field: string | null
          grade: string | null
          id: string
          profile_id: string
          school: string
          skills: string[]
          sort_order: number
          start_label: string
        }
        Insert: {
          activities?: string | null
          created_at?: string
          degree?: string | null
          description?: string | null
          end_label?: string
          field?: string | null
          grade?: string | null
          id?: string
          profile_id: string
          school: string
          skills?: string[]
          sort_order?: number
          start_label: string
        }
        Update: {
          activities?: string | null
          created_at?: string
          degree?: string | null
          description?: string | null
          end_label?: string
          field?: string | null
          grade?: string | null
          id?: string
          profile_id?: string
          school?: string
          skills?: string[]
          sort_order?: number
          start_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "education_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "education_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "education_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance_pings: {
        Row: {
          event_id: string
          minute: string
          profile_id: string
        }
        Insert: {
          event_id: string
          minute: string
          profile_id: string
        }
        Update: {
          event_id?: string
          minute?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_pings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_pings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_pings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_pings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checkin_codes: {
        Row: {
          code: string
          created_at: string
          event_id: string
        }
        Insert: {
          code?: string
          created_at?: string
          event_id: string
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checkin_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          invitee_id: string
          inviter_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          invitee_id: string
          inviter_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_post_rsvps: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_post_rsvps_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_post_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_post_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_post_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          attendance_method: string | null
          attended_at: string | null
          created_at: string
          event_id: string
          id: string
          profile_id: string
          reminder_sent_at: string | null
          status: string
        }
        Insert: {
          attendance_method?: string | null
          attended_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          profile_id: string
          reminder_sent_at?: string | null
          status?: string
        }
        Update: {
          attendance_method?: string | null
          attended_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string
          reminder_sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          agenda: Json
          archived_at: string | null
          created_at: string
          created_by: string | null
          cta_label: string
          description: string
          ends_at: string | null
          featured: boolean
          format: string
          id: string
          image_url: string | null
          location: string | null
          scheduled_at: string | null
          slug: string
          sort_order: number
          speakers: Json
          starts_at: string
          status: string
          timezone_label: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: Json
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string
          description: string
          ends_at?: string | null
          featured?: boolean
          format: string
          id?: string
          image_url?: string | null
          location?: string | null
          scheduled_at?: string | null
          slug: string
          sort_order?: number
          speakers?: Json
          starts_at: string
          status?: string
          timezone_label?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda?: Json
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string
          description?: string
          ends_at?: string | null
          featured?: boolean
          format?: string
          id?: string
          image_url?: string | null
          location?: string | null
          scheduled_at?: string | null
          slug?: string
          sort_order?: number
          speakers?: Json
          starts_at?: string
          status?: string
          timezone_label?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      federal_holidays: {
        Row: {
          day: string
          name: string
        }
        Insert: {
          day: string
          name: string
        }
        Update: {
          day?: string
          name?: string
        }
        Relationships: []
      }
      govcon_news: {
        Row: {
          archived_at: string | null
          created_at: string
          featured: boolean
          headline: string
          id: string
          published_at: string
          scheduled_at: string | null
          slug: string
          sort_order: number
          source_name: string
          source_url: string
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          featured?: boolean
          headline: string
          id?: string
          published_at?: string
          scheduled_at?: string | null
          slug: string
          sort_order?: number
          source_name: string
          source_url: string
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          featured?: boolean
          headline?: string
          id?: string
          published_at?: string
          scheduled_at?: string | null
          slug?: string
          sort_order?: number
          source_name?: string
          source_url?: string
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_application_notes: {
        Row: {
          application_id: string
          author_profile_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          application_id: string
          author_profile_id: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          application_id?: string
          author_profile_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_status_history: {
        Row: {
          application_id: string
          changed_by_profile_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          application_id: string
          changed_by_profile_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          application_id?: string
          changed_by_profile_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_status_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_status_history_changed_by_profile_id_fkey"
            columns: ["changed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_status_history_changed_by_profile_id_fkey"
            columns: ["changed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_status_history_changed_by_profile_id_fkey"
            columns: ["changed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          assigned_to_profile_id: string | null
          city: string | null
          consent_at: string
          cover_note: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          job_id: string
          last_name: string | null
          phone: string | null
          postal_code: string | null
          profile_id: string
          resume_storage_path: string | null
          state_region: string | null
          status: string
          street_address: string | null
          updated_at: string
        }
        Insert: {
          assigned_to_profile_id?: string | null
          city?: string | null
          consent_at?: string
          cover_note?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          job_id: string
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_id: string
          resume_storage_path?: string | null
          state_region?: string | null
          status?: string
          street_address?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to_profile_id?: string | null
          city?: string | null
          consent_at?: string
          cover_note?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          job_id?: string
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_id?: string
          resume_storage_path?: string | null
          state_region?: string | null
          status?: string
          street_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_categories: {
        Row: {
          created_at: string
          description: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      job_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          job_id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          job_id: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_saves: {
        Row: {
          created_at: string
          id: string
          job_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_saves_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_type: string
          application_url: string | null
          archived_at: string | null
          category_id: string | null
          clearance: string
          closed_at: string | null
          company_id: string
          compensation: string
          created_at: string
          description: string
          employment_type: string
          experience_level: string
          featured: boolean
          followers_notified_at: string | null
          id: string
          is_pro_only: boolean
          location: string
          posted_by_profile_id: string | null
          scheduled_at: string | null
          slug: string
          sort_order: number
          source: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          workplace: string
        }
        Insert: {
          application_type?: string
          application_url?: string | null
          archived_at?: string | null
          category_id?: string | null
          clearance?: string
          closed_at?: string | null
          company_id: string
          compensation: string
          created_at?: string
          description: string
          employment_type: string
          experience_level: string
          featured?: boolean
          followers_notified_at?: string | null
          id?: string
          is_pro_only?: boolean
          location: string
          posted_by_profile_id?: string | null
          scheduled_at?: string | null
          slug: string
          sort_order?: number
          source?: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          workplace: string
        }
        Update: {
          application_type?: string
          application_url?: string | null
          archived_at?: string | null
          category_id?: string | null
          clearance?: string
          closed_at?: string | null
          company_id?: string
          compensation?: string
          created_at?: string
          description?: string
          employment_type?: string
          experience_level?: string
          featured?: boolean
          followers_notified_at?: string | null
          id?: string
          is_pro_only?: boolean
          location?: string
          posted_by_profile_id?: string | null
          scheduled_at?: string | null
          slug?: string
          sort_order?: number
          source?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          workplace?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "job_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_lessons: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          min_read_seconds: number | null
          path_id: string
          slug: string
          sort_order: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          min_read_seconds?: number | null
          path_id: string
          slug: string
          sort_order?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          min_read_seconds?: number | null
          path_id?: string
          slug?: string
          sort_order?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_lessons_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_completions: {
        Row: {
          completed_at: string
          path_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          path_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          path_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_completions_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          active: boolean
          audience: string | null
          badge_code: string | null
          created_at: string
          id: string
          slug: string
          sort_order: number
          summary: string | null
          title: string
        }
        Insert: {
          active?: boolean
          audience?: string | null
          badge_code?: string | null
          created_at?: string
          id?: string
          slug: string
          sort_order?: number
          summary?: string | null
          title: string
        }
        Update: {
          active?: boolean
          audience?: string | null
          badge_code?: string | null
          created_at?: string
          id?: string
          slug?: string
          sort_order?: number
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["code"]
          },
        ]
      }
      learning_progress: {
        Row: {
          attempts: number
          best_score: number | null
          last_attempt_at: string | null
          lesson_id: string
          opened_at: string
          passed_at: string | null
          user_id: string
          xp_paid_at: string | null
        }
        Insert: {
          attempts?: number
          best_score?: number | null
          last_attempt_at?: string | null
          lesson_id: string
          opened_at?: string
          passed_at?: string | null
          user_id: string
          xp_paid_at?: string | null
        }
        Update: {
          attempts?: number
          best_score?: number | null
          last_attempt_at?: string | null
          lesson_id?: string
          opened_at?: string
          passed_at?: string | null
          user_id?: string
          xp_paid_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learning_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_questions: {
        Row: {
          correct_index: number
          explanation: string | null
          id: string
          lesson_id: string
          options: string[]
          prompt: string
          sort_order: number
        }
        Insert: {
          correct_index: number
          explanation?: string | null
          id?: string
          lesson_id: string
          options: string[]
          prompt: string
          sort_order?: number
        }
        Update: {
          correct_index?: number
          explanation?: string | null
          id?: string
          lesson_id?: string
          options?: string[]
          prompt?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learning_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      member_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_profile_id: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_profile_id: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_profile_id?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          read_at: string | null
          recommendation_request_id: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          read_at?: string | null
          recommendation_request_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          read_at?: string | null
          recommendation_request_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recommendation_request_id_fkey"
            columns: ["recommendation_request_id"]
            isOneToOne: false
            referencedRelation: "profile_recommendation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          consent: boolean
          created_at: string
          email: string
          id: string
          source: string
        }
        Insert: {
          consent?: boolean
          created_at?: string
          email: string
          id?: string
          source?: string
        }
        Update: {
          consent?: boolean
          created_at?: string
          email?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          level: string
          message: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          level?: string
          message: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          level?: string
          message?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          account_email: boolean
          account_in_app: boolean
          billing_email: boolean
          billing_in_app: boolean
          connections_email: boolean
          connections_in_app: boolean
          events_email: boolean
          events_in_app: boolean
          following_email: boolean
          following_in_app: boolean
          jobs_email: boolean
          jobs_in_app: boolean
          messages_email: boolean
          messages_in_app: boolean
          moderation_email: boolean
          moderation_in_app: boolean
          opportunities_email: boolean
          opportunities_in_app: boolean
          posts_email: boolean
          posts_in_app: boolean
          profile_id: string
          rewards_email: boolean
          rewards_in_app: boolean
          security_email: boolean
          security_in_app: boolean
          teaming_email: boolean
          teaming_in_app: boolean
          updated_at: string
        }
        Insert: {
          account_email?: boolean
          account_in_app?: boolean
          billing_email?: boolean
          billing_in_app?: boolean
          connections_email?: boolean
          connections_in_app?: boolean
          events_email?: boolean
          events_in_app?: boolean
          following_email?: boolean
          following_in_app?: boolean
          jobs_email?: boolean
          jobs_in_app?: boolean
          messages_email?: boolean
          messages_in_app?: boolean
          moderation_email?: boolean
          moderation_in_app?: boolean
          opportunities_email?: boolean
          opportunities_in_app?: boolean
          posts_email?: boolean
          posts_in_app?: boolean
          profile_id: string
          rewards_email?: boolean
          rewards_in_app?: boolean
          security_email?: boolean
          security_in_app?: boolean
          teaming_email?: boolean
          teaming_in_app?: boolean
          updated_at?: string
        }
        Update: {
          account_email?: boolean
          account_in_app?: boolean
          billing_email?: boolean
          billing_in_app?: boolean
          connections_email?: boolean
          connections_in_app?: boolean
          events_email?: boolean
          events_in_app?: boolean
          following_email?: boolean
          following_in_app?: boolean
          jobs_email?: boolean
          jobs_in_app?: boolean
          messages_email?: boolean
          messages_in_app?: boolean
          moderation_email?: boolean
          moderation_in_app?: boolean
          opportunities_email?: boolean
          opportunities_in_app?: boolean
          posts_email?: boolean
          posts_in_app?: boolean
          profile_id?: string
          rewards_email?: boolean
          rewards_in_app?: boolean
          security_email?: boolean
          security_in_app?: boolean
          teaming_email?: boolean
          teaming_in_app?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          email_attempts: number
          email_error: string | null
          email_sent_at: string | null
          id: string
          link_path: string
          read_at: string | null
          recipient_id: string
          subject_id: string | null
          subject_type: string
          title: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          email_attempts?: number
          email_error?: string | null
          email_sent_at?: string | null
          id?: string
          link_path: string
          read_at?: string | null
          recipient_id: string
          subject_id?: string | null
          subject_type: string
          title: string
          type: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          email_attempts?: number
          email_error?: string | null
          email_sent_at?: string | null
          id?: string
          link_path?: string
          read_at?: string | null
          recipient_id?: string
          subject_id?: string | null
          subject_type?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          agency: string | null
          archived_at: string | null
          archived_reason: string | null
          closed_at: string | null
          company_id: string | null
          content_hash: string | null
          contract_value_max: number | null
          contract_value_min: number | null
          created_at: string
          description: string
          featured: boolean
          followers_notified_at: string | null
          id: string
          last_seen_in_sync_at: string | null
          last_synced_at: string | null
          location: string
          naics_code: string
          notice_id: string | null
          notice_type: string | null
          office: string | null
          place_city: string | null
          place_country: string
          place_state: string | null
          place_zip: string | null
          posted_by_profile_id: string | null
          posted_date: string | null
          psc_code: string | null
          response_deadline: string | null
          scheduled_at: string | null
          set_aside_code: string | null
          set_aside_description: string | null
          slug: string
          solicitation_number: string | null
          sort_order: number
          source: string
          source_url: string | null
          status: string
          subagency: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          agency?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          closed_at?: string | null
          company_id?: string | null
          content_hash?: string | null
          contract_value_max?: number | null
          contract_value_min?: number | null
          created_at?: string
          description: string
          featured?: boolean
          followers_notified_at?: string | null
          id?: string
          last_seen_in_sync_at?: string | null
          last_synced_at?: string | null
          location: string
          naics_code: string
          notice_id?: string | null
          notice_type?: string | null
          office?: string | null
          place_city?: string | null
          place_country?: string
          place_state?: string | null
          place_zip?: string | null
          posted_by_profile_id?: string | null
          posted_date?: string | null
          psc_code?: string | null
          response_deadline?: string | null
          scheduled_at?: string | null
          set_aside_code?: string | null
          set_aside_description?: string | null
          slug: string
          solicitation_number?: string | null
          sort_order?: number
          source?: string
          source_url?: string | null
          status?: string
          subagency?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          agency?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          closed_at?: string | null
          company_id?: string | null
          content_hash?: string | null
          contract_value_max?: number | null
          contract_value_min?: number | null
          created_at?: string
          description?: string
          featured?: boolean
          followers_notified_at?: string | null
          id?: string
          last_seen_in_sync_at?: string | null
          last_synced_at?: string | null
          location?: string
          naics_code?: string
          notice_id?: string | null
          notice_type?: string | null
          office?: string | null
          place_city?: string | null
          place_country?: string
          place_state?: string | null
          place_zip?: string | null
          posted_by_profile_id?: string | null
          posted_date?: string | null
          psc_code?: string | null
          response_deadline?: string | null
          scheduled_at?: string | null
          set_aside_code?: string | null
          set_aside_description?: string | null
          slug?: string
          solicitation_number?: string | null
          sort_order?: number
          source?: string
          source_url?: string | null
          status?: string
          subagency?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_attachments: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          opportunity_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label: string
          opportunity_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          opportunity_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_attachments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          opportunity_id: string
          phone: string | null
          role: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          opportunity_id: string
          phone?: string | null
          role?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          opportunity_id?: string
          phone?: string | null
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_contacts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          opportunity_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          opportunity_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          opportunity_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          opportunity_id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          opportunity_id: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          opportunity_id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_reports_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_responses: {
        Row: {
          created_at: string
          id: string
          opportunity_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          opportunity_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          opportunity_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_responses_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_sync_errors: {
        Row: {
          created_at: string
          id: string
          message: string
          notice_id: string | null
          raw_payload: Json | null
          run_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          notice_id?: string | null
          raw_payload?: Json | null
          run_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          notice_id?: string | null
          raw_payload?: Json | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_sync_errors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_sync_runs: {
        Row: {
          archived_count: number
          created_count: number
          error_summary: string | null
          failed_count: number
          finished_at: string | null
          id: string
          pages_fetched: number
          params: Json
          records_seen: number
          skipped_count: number
          source: string
          started_at: string
          status: string
          trigger: string
          triggered_by_profile_id: string | null
          updated_count: number
        }
        Insert: {
          archived_count?: number
          created_count?: number
          error_summary?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          pages_fetched?: number
          params?: Json
          records_seen?: number
          skipped_count?: number
          source?: string
          started_at?: string
          status?: string
          trigger: string
          triggered_by_profile_id?: string | null
          updated_count?: number
        }
        Update: {
          archived_count?: number
          created_count?: number
          error_summary?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          pages_fetched?: number
          params?: Json
          records_seen?: number
          skipped_count?: number
          source?: string
          started_at?: string
          status?: string
          trigger?: string
          triggered_by_profile_id?: string | null
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_sync_runs_triggered_by_profile_id_fkey"
            columns: ["triggered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_sync_runs_triggered_by_profile_id_fkey"
            columns: ["triggered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_sync_runs_triggered_by_profile_id_fkey"
            columns: ["triggered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_tracking: {
        Row: {
          amendment_alerts: boolean
          bid_submitted_at: string | null
          created_at: string
          custom_stage_id: string | null
          id: string
          notes: string | null
          opportunity_id: string
          outcome: string | null
          outcome_at: string | null
          profile_id: string
          reminder_days: number[] | null
          stage: string
          updated_at: string
        }
        Insert: {
          amendment_alerts?: boolean
          created_at?: string
          custom_stage_id?: string | null
          id?: string
          notes?: string | null
          opportunity_id: string
          profile_id: string
          reminder_days?: number[] | null
          stage?: string
          updated_at?: string
        }
        Update: {
          amendment_alerts?: boolean
          created_at?: string
          custom_stage_id?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string
          profile_id?: string
          reminder_days?: number[] | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_tracking_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_tracking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_tracking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_tracking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_tracking_tasks: {
        Row: {
          created_at: string
          done: boolean
          due_at: string | null
          id: string
          title: string
          tracking_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          title: string
          tracking_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          title?: string
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_tracking_tasks_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "opportunity_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_reminders_sent: {
        Row: {
          days_before: number
          sent_at: string
          tracking_id: string
        }
        Insert: {
          days_before: number
          sent_at?: string
          tracking_id: string
        }
        Update: {
          days_before?: number
          sent_at?: string
          tracking_id?: string
        }
        Relationships: []
      }
      bid_tracker_settings: {
        Row: {
          profile_id: string
          reminder_days: number[]
          stages_initialized: boolean
          updated_at: string
        }
        Insert: {
          profile_id: string
          reminder_days?: number[]
          stages_initialized?: boolean
          updated_at?: string
        }
        Update: {
          profile_id?: string
          reminder_days?: number[]
          stages_initialized?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bid_tracker_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          profile_id: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          profile_id: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          profile_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      opportunity_tracking_shares: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          shared_by: string
          tracking_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          shared_by: string
          tracking_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          shared_by?: string
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_tracking_shares_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "opportunity_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_inquiries: {
        Row: {
          applicant_response: string | null
          company_id: string | null
          contact_email: string
          contact_name: string
          created_at: string
          guidelines_agreed_at: string | null
          id: string
          info_request: string | null
          info_requested_at: string | null
          message: string
          no_federal_ids: boolean
          organization_name: string
          partner_type: string | null
          responded_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
        }
        Insert: {
          applicant_response?: string | null
          company_id?: string | null
          contact_email: string
          contact_name: string
          created_at?: string
          guidelines_agreed_at?: string | null
          id?: string
          info_request?: string | null
          info_requested_at?: string | null
          message: string
          no_federal_ids?: boolean
          organization_name: string
          partner_type?: string | null
          responded_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
        }
        Update: {
          applicant_response?: string | null
          company_id?: string | null
          contact_email?: string
          contact_name?: string
          created_at?: string
          guidelines_agreed_at?: string | null
          id?: string
          info_request?: string | null
          info_requested_at?: string | null
          message?: string
          no_federal_ids?: boolean
          organization_name?: string
          partner_type?: string | null
          responded_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_inquiries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiries_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_inquiry_attachments: {
        Row: {
          company_id: string
          content_type: string
          created_at: string
          file_name: string
          id: string
          info_request: string | null
          inquiry_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          content_type: string
          created_at?: string
          file_name: string
          id?: string
          info_request?: string | null
          inquiry_id: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          content_type?: string
          created_at?: string
          file_name?: string
          id?: string
          info_request?: string | null
          inquiry_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_inquiry_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiry_attachments_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "partner_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiry_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiry_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_inquiry_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          archived_at: string | null
          created_at: string
          featured: boolean
          id: string
          logo_url: string | null
          name: string
          placement: string
          scheduled_at: string | null
          sort_order: number
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          logo_url?: string | null
          name: string
          placement: string
          scheduled_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          placement?: string
          scheduled_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      person_saves: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          saved_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          saved_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          saved_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_saves_saved_profile_id_fkey"
            columns: ["saved_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_saves_saved_profile_id_fkey"
            columns: ["saved_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_saves_saved_profile_id_fkey"
            columns: ["saved_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          feature_key: string
          id: string
          limit_value: number | null
          plan: string
          updated_at: string
        }
        Insert: {
          feature_key: string
          id?: string
          limit_value?: number | null
          plan: string
          updated_at?: string
        }
        Update: {
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_metrics: {
        Row: {
          id: string
          label: string
          metric_key: string
          override_value: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          metric_key: string
          override_value?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          metric_key?: string
          override_value?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      point_events: {
        Row: {
          action_type: string
          actor_user_id: string | null
          community_id: string | null
          created_at: string
          credits: number
          dedupe_key: string
          id: string
          local_day: string
          meta: Json
          multiplier: number
          rep: number
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_id: string | null
          source_type: string | null
          user_id: string
          xp: number
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          community_id?: string | null
          created_at?: string
          credits?: number
          dedupe_key: string
          id?: string
          local_day: string
          meta?: Json
          multiplier?: number
          rep?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          user_id: string
          xp?: number
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          community_id?: string | null
          created_at?: string
          credits?: number
          dedupe_key?: string
          id?: string
          local_day?: string
          meta?: Json
          multiplier?: number
          rep?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_events_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "point_rules"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "point_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_levels: {
        Row: {
          credits_reward: number
          level: number
          pro_days: number
          rank_name: string
          unlocks: string | null
          xp_required: number
        }
        Insert: {
          credits_reward?: number
          level: number
          pro_days?: number
          rank_name: string
          unlocks?: string | null
          xp_required: number
        }
        Update: {
          credits_reward?: number
          level?: number
          pro_days?: number
          rank_name?: string
          unlocks?: string | null
          xp_required?: number
        }
        Relationships: []
      }
      point_rules: {
        Row: {
          action_type: string
          active: boolean
          category: string
          counts_for_streak: boolean
          credits: number
          daily_cap: number | null
          label: string
          monthly_cap: number | null
          notes: string | null
          rep: number
          sort_order: number
          xp: number
        }
        Insert: {
          action_type: string
          active?: boolean
          category: string
          counts_for_streak?: boolean
          credits?: number
          daily_cap?: number | null
          label: string
          monthly_cap?: number | null
          notes?: string | null
          rep?: number
          sort_order?: number
          xp?: number
        }
        Update: {
          action_type?: string
          active?: boolean
          category?: string
          counts_for_streak?: boolean
          credits?: number
          daily_cap?: number | null
          label?: string
          monthly_cap?: number | null
          notes?: string | null
          rep?: number
          sort_order?: number
          xp?: number
        }
        Relationships: []
      }
      points_admin_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          detail: Json
          id: string
          reason: string
          user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          reason: string
          user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          reason?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_admin_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_admin_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_admin_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_email_outbox: {
        Row: {
          body: string | null
          created_at: string
          cta_label: string
          cta_path: string
          error: string | null
          id: string
          kind: string
          sent_at: string | null
          subject: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          cta_label?: string
          cta_path?: string
          error?: string | null
          id?: string
          kind: string
          sent_at?: string | null
          subject: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          cta_label?: string
          cta_path?: string
          error?: string | null
          id?: string
          kind?: string
          sent_at?: string | null
          subject?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_email_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_email_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_email_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_flags: {
        Row: {
          created_at: string
          detail: Json
          id: string
          kind: string
          related_user_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          related_user_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          related_user_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_flags_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          id: string
          label: string
          post_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          label: string
          post_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          label?: string
          post_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          poll_option_id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          poll_option_id: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          poll_option_id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_option_id_fkey"
            columns: ["poll_option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_profile_id: string
          body: string
          created_at: string
          id: string
          image_url: string | null
          like_count: number
          parent_comment_id: string | null
          post_id: string
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          author_profile_id: string
          body: string
          created_at?: string
          id?: string
          image_url?: string | null
          like_count?: number
          parent_comment_id?: string | null
          post_id: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          author_profile_id?: string
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          like_count?: number
          parent_comment_id?: string | null
          post_id?: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_edit_history: {
        Row: {
          edited_at: string
          editor_profile_id: string
          id: string
          post_id: string
          previous_body: string
          previous_title: string | null
        }
        Insert: {
          edited_at?: string
          editor_profile_id: string
          id?: string
          post_id: string
          previous_body: string
          previous_title?: string | null
        }
        Update: {
          edited_at?: string
          editor_profile_id?: string
          id?: string
          post_id?: string
          previous_body?: string
          previous_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_edit_history_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_edit_history_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_edit_history_editor_profile_id_fkey"
            columns: ["editor_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_edit_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_follows: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_follows_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          id: string
          kind: string
          post_id: string
          poster_path: string | null
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          post_id: string
          poster_path?: string | null
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          post_id?: string
          poster_path?: string | null
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_moderation_log: {
        Row: {
          action: string
          actor_profile_id: string
          community_id: string | null
          created_at: string
          from_community_id: string | null
          id: string
          post_id: string
          reason: string | null
          to_community_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          community_id?: string | null
          created_at?: string
          from_community_id?: string | null
          id?: string
          post_id: string
          reason?: string | null
          to_community_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          community_id?: string | null
          created_at?: string
          from_community_id?: string | null
          id?: string
          post_id?: string
          reason?: string | null
          to_community_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_moderation_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_moderation_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_moderation_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_moderation_log_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_moderation_log_from_community_id_fkey"
            columns: ["from_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_moderation_log_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_moderation_log_to_community_id_fkey"
            columns: ["to_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          comment_id: string | null
          created_at: string
          details: string | null
          id: string
          post_id: string | null
          priority: number
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          priority?: number
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          priority?: number
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          created_at: string
          id: string
          post_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_votes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          accepted_comment_id: string | null
          archived_at: string | null
          audience: string
          author_profile_id: string
          body: string
          category: string
          comment_count: number
          community_id: string | null
          company_id: string | null
          cover_image_url: string | null
          created_at: string
          edited_at: string | null
          event_ends_at: string | null
          event_location: string | null
          event_starts_at: string | null
          featured: boolean
          going_count: number
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          interested_count: number
          link_url: string | null
          locked_at: string | null
          locked_by: string | null
          pinned_at: string | null
          pinned_by: string | null
          poll_closes_at: string | null
          post_type: string
          posted_at: string
          repost_of_post_id: string | null
          scheduled_at: string | null
          share_count: number
          slug: string
          sort_order: number
          status: string
          tags: string[]
          title: string
          updated_at: string
          votes: number
        }
        Insert: {
          accepted_comment_id?: string | null
          archived_at?: string | null
          audience?: string
          author_profile_id: string
          body: string
          category: string
          comment_count?: number
          community_id?: string | null
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          edited_at?: string | null
          event_ends_at?: string | null
          event_location?: string | null
          event_starts_at?: string | null
          featured?: boolean
          going_count?: number
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          interested_count?: number
          link_url?: string | null
          locked_at?: string | null
          locked_by?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          poll_closes_at?: string | null
          post_type?: string
          posted_at?: string
          repost_of_post_id?: string | null
          scheduled_at?: string | null
          share_count?: number
          slug: string
          sort_order?: number
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          votes?: number
        }
        Update: {
          accepted_comment_id?: string | null
          archived_at?: string | null
          audience?: string
          author_profile_id?: string
          body?: string
          category?: string
          comment_count?: number
          community_id?: string | null
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          edited_at?: string | null
          event_ends_at?: string | null
          event_location?: string | null
          event_starts_at?: string | null
          featured?: boolean
          going_count?: number
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          interested_count?: number
          link_url?: string | null
          locked_at?: string | null
          locked_by?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          poll_closes_at?: string | null
          post_type?: string
          posted_at?: string
          repost_of_post_id?: string | null
          scheduled_at?: string | null
          share_count?: number
          slug?: string
          sort_order?: number
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_accepted_comment_id_fkey"
            columns: ["accepted_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_repost_of_post_id_fkey"
            columns: ["repost_of_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_recommendation_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          recipient_position: string | null
          recommender_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          recipient_position?: string | null
          recommender_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          recipient_position?: string | null
          recommender_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_recommendation_requests_recommender_id_fkey"
            columns: ["recommender_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendation_requests_recommender_id_fkey"
            columns: ["recommender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendation_requests_recommender_id_fkey"
            columns: ["recommender_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendation_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendation_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendation_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_recommendations: {
        Row: {
          author_id: string
          body: string
          created_at: string
          decided_at: string | null
          id: string
          recipient_id: string
          recipient_position: string | null
          relationship: string
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          decided_at?: string | null
          id?: string
          recipient_id: string
          recipient_position?: string | null
          relationship: string
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          recipient_id?: string
          recipient_position?: string | null
          relationship?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_recommendations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_recommendations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_search_impressions: {
        Row: {
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_search_impressions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_search_impressions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_search_impressions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_views: {
        Row: {
          created_at: string
          id: string
          viewed_profile_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          viewed_profile_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          viewed_profile_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_viewed_profile_id_fkey"
            columns: ["viewed_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewed_profile_id_fkey"
            columns: ["viewed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewed_profile_id_fkey"
            columns: ["viewed_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          away_message: string | null
          away_message_enabled: boolean
          bio: string | null
          certifications: string[]
          clearance: string | null
          clearance_proof_note: string | null
          clearance_proof_path: string | null
          clearance_review_note: string | null
          clearance_reviewed_at: string | null
          clearance_reviewed_by: string | null
          clearance_status: string
          clearance_submitted_at: string | null
          company_name: string | null
          connections_visible: boolean
          capability_statement_name: string | null
          capability_statement_uploaded_at: string | null
          capability_statement_url: string | null
          cover_image_url: string | null
          created_at: string
          email: string
          experience_level: string | null
          first_name: string
          govcon_interests: string[]
          headline: string | null
          id: string
          industries: string[]
          invite_rewarded_at: string | null
          invited_by: string | null
          job_title: string | null
          languages: string | null
          last_name: string
          linkedin_url: string | null
          location: string | null
          marketing_consent: boolean
          naics_interests: string[]
          open_to: string[]
          phone: string | null
          plan_selection: string
          pro_grant_until: string | null
          pro_granted_by_points: boolean
          pronouns: string | null
          referral_source: string | null
          relationship_goals: string | null
          role: string
          services: string[]
          signup_ip: string | null
          skills: string[]
          slug: string
          specialty: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suspended_at: string | null
          suspended_reason: string | null
          terms_accepted_at: string
          twitter_url: string | null
          updated_at: string
          website: string | null
          welcome_notification_sent_at: string | null
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          away_message?: string | null
          away_message_enabled?: boolean
          bio?: string | null
          certifications?: string[]
          clearance?: string | null
          clearance_proof_note?: string | null
          clearance_proof_path?: string | null
          clearance_review_note?: string | null
          clearance_reviewed_at?: string | null
          clearance_reviewed_by?: string | null
          clearance_status?: string
          clearance_submitted_at?: string | null
          company_name?: string | null
          connections_visible?: boolean
          capability_statement_name?: string | null
          capability_statement_uploaded_at?: string | null
          capability_statement_url?: string | null
          cover_image_url?: string | null
          created_at?: string
          email: string
          experience_level?: string | null
          first_name: string
          govcon_interests?: string[]
          headline?: string | null
          id: string
          industries?: string[]
          invite_rewarded_at?: string | null
          invited_by?: string | null
          job_title?: string | null
          languages?: string | null
          last_name: string
          linkedin_url?: string | null
          location?: string | null
          marketing_consent?: boolean
          naics_interests?: string[]
          open_to?: string[]
          phone?: string | null
          plan_selection?: string
          pro_grant_until?: string | null
          pro_granted_by_points?: boolean
          pronouns?: string | null
          referral_source?: string | null
          relationship_goals?: string | null
          role?: string
          services?: string[]
          signup_ip?: string | null
          skills?: string[]
          slug: string
          specialty?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          terms_accepted_at?: string
          twitter_url?: string | null
          updated_at?: string
          website?: string | null
          welcome_notification_sent_at?: string | null
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          away_message?: string | null
          away_message_enabled?: boolean
          bio?: string | null
          certifications?: string[]
          clearance?: string | null
          clearance_proof_note?: string | null
          clearance_proof_path?: string | null
          clearance_review_note?: string | null
          clearance_reviewed_at?: string | null
          clearance_reviewed_by?: string | null
          clearance_status?: string
          clearance_submitted_at?: string | null
          company_name?: string | null
          connections_visible?: boolean
          capability_statement_name?: string | null
          capability_statement_uploaded_at?: string | null
          capability_statement_url?: string | null
          cover_image_url?: string | null
          created_at?: string
          email?: string
          experience_level?: string | null
          first_name?: string
          govcon_interests?: string[]
          headline?: string | null
          id?: string
          industries?: string[]
          invite_rewarded_at?: string | null
          invited_by?: string | null
          job_title?: string | null
          languages?: string | null
          last_name?: string
          linkedin_url?: string | null
          location?: string | null
          marketing_consent?: boolean
          naics_interests?: string[]
          open_to?: string[]
          phone?: string | null
          plan_selection?: string
          pro_grant_until?: string | null
          pro_granted_by_points?: boolean
          pronouns?: string | null
          referral_source?: string | null
          relationship_goals?: string | null
          role?: string
          services?: string[]
          signup_ip?: string | null
          skills?: string[]
          slug?: string
          specialty?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          terms_accepted_at?: string
          twitter_url?: string | null
          updated_at?: string
          website?: string | null
          welcome_notification_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clearance_reviewed_by_fkey"
            columns: ["clearance_reviewed_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_clearance_reviewed_by_fkey"
            columns: ["clearance_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_clearance_reviewed_by_fkey"
            columns: ["clearance_reviewed_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          action_types: string[]
          active: boolean
          code: string
          difficulty: string
          filters: Json
          id: string
          link_path: string | null
          quest_set: string
          requires: string | null
          sort_order: number
          target_count: number
          title: string
          weight: number
        }
        Insert: {
          action_types: string[]
          active?: boolean
          code: string
          difficulty: string
          filters?: Json
          id?: string
          link_path?: string | null
          quest_set?: string
          requires?: string | null
          sort_order?: number
          target_count?: number
          title: string
          weight?: number
        }
        Update: {
          action_types?: string[]
          active?: boolean
          code?: string
          difficulty?: string
          filters?: Json
          id?: string
          link_path?: string | null
          quest_set?: string
          requires?: string | null
          sort_order?: number
          target_count?: number
          title?: string
          weight?: number
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decline_reason: string | null
          expires_at: string | null
          id: string
          meta: Json
          price: number
          reward_code: string
          reward_id: string
          starts_at: string
          status: string
          target_id: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decline_reason?: string | null
          expires_at?: string | null
          id?: string
          meta?: Json
          price: number
          reward_code: string
          reward_id: string
          starts_at?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decline_reason?: string | null
          expires_at?: string | null
          id?: string
          meta?: Json
          price?: number
          reward_code?: string
          reward_id?: string
          starts_at?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_audit_log: {
        Row: {
          id: number
          resource_id: string
          resource_title: string | null
          actor_id: string | null
          action: string
          changes: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          resource_id: string
          resource_title?: string | null
          actor_id?: string | null
          action: string
          changes?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          resource_id?: string
          resource_title?: string | null
          actor_id?: string | null
          action?: string
          changes?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      resource_categories: {
        Row: {
          id: string
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      resource_events: {
        Row: {
          id: number
          resource_id: string
          profile_id: string | null
          kind: string
          created_at: string
        }
        Insert: {
          id?: number
          resource_id: string
          profile_id?: string | null
          kind: string
          created_at?: string
        }
        Update: {
          id?: number
          resource_id?: string
          profile_id?: string | null
          kind?: string
          created_at?: string
        }
        Relationships: []
      }
      resource_requests: {
        Row: {
          id: string
          profile_id: string
          topic: string
          details: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          topic: string
          details?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          topic?: string
          details?: string | null
          created_at?: string
        }
        Relationships: []
      }
      resource_searches: {
        Row: {
          id: number
          query: string
          profile_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          query: string
          profile_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          query?: string
          profile_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      resource_types: {
        Row: {
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          name?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      resource_versions: {
        Row: {
          id: string
          resource_id: string
          kind: string
          url: string | null
          file_path: string | null
          file_name: string | null
          file_size: number | null
          file_ext: string | null
          video_provider: string | null
          video_id: string | null
          replaced_at: string
          replaced_by: string | null
        }
        Insert: {
          id?: string
          resource_id: string
          kind: string
          url?: string | null
          file_path?: string | null
          file_name?: string | null
          file_size?: number | null
          file_ext?: string | null
          video_provider?: string | null
          video_id?: string | null
          replaced_at?: string
          replaced_by?: string | null
        }
        Update: {
          id?: string
          resource_id?: string
          kind?: string
          url?: string | null
          file_path?: string | null
          file_name?: string | null
          file_size?: number | null
          file_ext?: string | null
          video_provider?: string | null
          video_id?: string | null
          replaced_at?: string
          replaced_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_versions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_upgrade_events: {
        Row: {
          id: number
          profile_id: string
          source: string
          kind: string
          resource_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          profile_id: string
          source: string
          kind: string
          resource_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          profile_id?: string
          source?: string
          kind?: string
          resource_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      resource_saves: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          resource_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          resource_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_saves_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          access: string
          archived_at: string | null
          created_at: string
          description: string
          featured: boolean
          id: string
          is_pro: boolean
          scheduled_at: string | null
          slug: string
          sort_order: number
          status: string
          submitted_by: string | null
          title: string
          type: string
          updated_at: string
          url: string | null
          file_ext: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_uploaded_at: string | null
          kind: string
          scan_status: string | null
          scanned_at: string | null
          video_duration_seconds: number | null
          video_id: string | null
          video_provider: string | null
          video_thumbnail_url: string | null
          body: string | null
          category_id: string | null
          tags: string[]
          thumbnail_url: string | null
          thumbnail_auto: boolean
          source: string | null
          deleted_at: string | null
          deleted_by: string | null
          policy_removed_at: string | null
          submission_status: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          link_status: string | null
          link_error: string | null
          link_checked_at: string | null
          link_failed_at: string | null
          link_fail_streak: number
          auto_hidden_at: string | null
        }
        Insert: {
          access?: string
          archived_at?: string | null
          created_at?: string
          description: string
          featured?: boolean
          id?: string
          is_pro?: boolean
          scheduled_at?: string | null
          slug: string
          sort_order?: number
          status?: string
          submitted_by?: string | null
          title: string
          type: string
          updated_at?: string
          url?: string | null
          file_ext?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_uploaded_at?: string | null
          kind?: string
          scan_status?: string | null
          scanned_at?: string | null
          video_duration_seconds?: number | null
          video_id?: string | null
          video_provider?: string | null
          video_thumbnail_url?: string | null
          body?: string | null
          category_id?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          thumbnail_auto?: boolean
          source?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          policy_removed_at?: string | null
          submission_status?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          link_status?: string | null
          link_error?: string | null
          link_checked_at?: string | null
          link_failed_at?: string | null
          link_fail_streak?: number
          auto_hidden_at?: string | null
        }
        Update: {
          access?: string
          archived_at?: string | null
          created_at?: string
          description?: string
          featured?: boolean
          id?: string
          is_pro?: boolean
          scheduled_at?: string | null
          slug?: string
          sort_order?: number
          status?: string
          submitted_by?: string | null
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
          file_ext?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_uploaded_at?: string | null
          kind?: string
          scan_status?: string | null
          scanned_at?: string | null
          video_duration_seconds?: number | null
          video_id?: string | null
          video_provider?: string | null
          video_thumbnail_url?: string | null
          body?: string | null
          category_id?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          thumbnail_auto?: boolean
          source?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          policy_removed_at?: string | null
          submission_status?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          link_status?: string | null
          link_error?: string | null
          link_checked_at?: string | null
          link_failed_at?: string | null
          link_fail_streak?: number
          auto_hidden_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "resource_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          fulfilment: string | null
          partner_company_id: string | null
          partner_url: string | null
          stock_count: number | null
          stock_period: string
          turnaround_days: number | null
          active: boolean
          category: string
          code: string
          cosmetic_kind: string | null
          cosmetic_value: string | null
          description: string | null
          duration_hours: number | null
          free_members_only: boolean
          id: string
          limit_count: number | null
          limit_per_target: boolean
          limit_period: string | null
          min_level: number
          name: string
          needs_review: boolean
          price: number
          pro_days: number
          sort_order: number
          target_type: string | null
        }
        Insert: {
          fulfilment?: string | null
          partner_company_id?: string | null
          partner_url?: string | null
          stock_count?: number | null
          stock_period?: string
          turnaround_days?: number | null
          active?: boolean
          category: string
          code: string
          cosmetic_kind?: string | null
          cosmetic_value?: string | null
          description?: string | null
          duration_hours?: number | null
          free_members_only?: boolean
          id?: string
          limit_count?: number | null
          limit_per_target?: boolean
          limit_period?: string | null
          min_level?: number
          name: string
          needs_review?: boolean
          price: number
          pro_days?: number
          sort_order?: number
          target_type?: string | null
        }
        Update: {
          fulfilment?: string | null
          partner_company_id?: string | null
          partner_url?: string | null
          stock_count?: number | null
          stock_period?: string
          turnaround_days?: number | null
          active?: boolean
          category?: string
          code?: string
          cosmetic_kind?: string | null
          cosmetic_value?: string | null
          description?: string | null
          duration_hours?: number | null
          free_members_only?: boolean
          id?: string
          limit_count?: number | null
          limit_per_target?: boolean
          limit_period?: string | null
          min_level?: number
          name?: string
          needs_review?: boolean
          price?: number
          pro_days?: number
          sort_order?: number
          target_type?: string | null
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          alert_channel: string
          alert_frequency: string
          created_at: string
          enabled: boolean
          filters: Json
          id: string
          last_run_at: string | null
          name: string
          profile_id: string
          scope: string
        }
        Insert: {
          alert_channel?: string
          alert_frequency?: string
          created_at?: string
          enabled?: boolean
          filters?: Json
          id?: string
          last_run_at?: string | null
          name: string
          profile_id: string
          scope?: string
        }
        Update: {
          alert_channel?: string
          alert_frequency?: string
          created_at?: string
          enabled?: boolean
          filters?: Json
          id?: string
          last_run_at?: string | null
          name?: string
          profile_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          query: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          query: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          query?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_results: {
        Row: {
          rank: number | null
          rep: number
          reward: string | null
          season_id: string
          season_points: number
          spotlight: boolean
          streak_days: number
          user_id: string
          xp: number
        }
        Insert: {
          rank?: number | null
          rep?: number
          reward?: string | null
          season_id: string
          season_points?: number
          spotlight?: boolean
          streak_days?: number
          user_id: string
          xp?: number
        }
        Update: {
          rank?: number | null
          rep?: number
          reward?: string | null
          season_id?: string
          season_points?: number
          spotlight?: boolean
          streak_days?: number
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_results_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          code: string
          ends_at: string
          featured_challenge_code: string | null
          finalized_at: string | null
          id: string
          name: string
          notified_1d_at: string | null
          notified_7d_at: string | null
          starts_at: string
          theme: string | null
        }
        Insert: {
          code: string
          ends_at: string
          featured_challenge_code?: string | null
          finalized_at?: string | null
          id?: string
          name: string
          notified_1d_at?: string | null
          notified_7d_at?: string | null
          starts_at: string
          theme?: string | null
        }
        Update: {
          code?: string
          ends_at?: string
          featured_challenge_code?: string | null
          finalized_at?: string | null
          id?: string
          name?: string
          notified_1d_at?: string | null
          notified_7d_at?: string | null
          starts_at?: string
          theme?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      sponsored_content: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          cta_label: string
          cta_url: string
          featured: boolean
          headline: string
          id: string
          image_url: string | null
          scheduled_at: string | null
          sort_order: number
          sponsor_name: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          cta_label?: string
          cta_url: string
          featured?: boolean
          headline: string
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sort_order?: number
          sponsor_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          cta_label?: string
          cta_url?: string
          featured?: boolean
          headline?: string
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sort_order?: number
          sponsor_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      streak_buddy_milestones: {
        Row: {
          badge_code: string | null
          credits: number
          days: number
          xp: number
        }
        Insert: {
          badge_code?: string | null
          credits?: number
          days: number
          xp?: number
        }
        Update: {
          badge_code?: string | null
          credits?: number
          days?: number
          xp?: number
        }
        Relationships: []
      }
      streak_milestones: {
        Row: {
          badge_code: string | null
          credits: number
          days: number
          flair: string | null
          multiplier: number
          xp: number
        }
        Insert: {
          badge_code?: string | null
          credits?: number
          days: number
          flair?: string | null
          multiplier?: number
          xp?: number
        }
        Update: {
          badge_code?: string | null
          credits?: number
          days?: number
          flair?: string | null
          multiplier?: number
          xp?: number
        }
        Relationships: []
      }
      teaming_inquiries: {
        Row: {
          attachment_storage_path: string | null
          created_at: string
          id: string
          message: string
          opportunity_id: string | null
          recipient_profile_id: string
          reply_message: string | null
          requested_role: string
          responded_at: string | null
          sender_profile_id: string
          status: string
        }
        Insert: {
          attachment_storage_path?: string | null
          created_at?: string
          id?: string
          message: string
          opportunity_id?: string | null
          recipient_profile_id: string
          reply_message?: string | null
          requested_role: string
          responded_at?: string | null
          sender_profile_id: string
          status?: string
        }
        Update: {
          attachment_storage_path?: string | null
          created_at?: string
          id?: string
          message?: string
          opportunity_id?: string | null
          recipient_profile_id?: string
          reply_message?: string | null
          requested_role?: string
          responded_at?: string | null
          sender_profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaming_inquiries_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_inquiries_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_inquiries_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_inquiries_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_inquiries_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_inquiries_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_inquiries_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teaming_interests: {
        Row: {
          active: boolean
          certifications: string[]
          created_at: string
          id: string
          locations: string[]
          naics_codes: string[]
          notes: string | null
          profile_id: string
          role_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          certifications?: string[]
          created_at?: string
          id?: string
          locations?: string[]
          naics_codes?: string[]
          notes?: string | null
          profile_id: string
          role_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          certifications?: string[]
          created_at?: string
          id?: string
          locations?: string[]
          naics_codes?: string[]
          notes?: string | null
          profile_id?: string
          role_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaming_interests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_interests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_interests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teaming_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          inquiry_id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          inquiry_id: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          inquiry_id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaming_reports_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "teaming_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaming_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          archived_at: string | null
          created_at: string
          featured: boolean
          id: string
          initials: string
          name: string
          quote: string
          role: string
          scheduled_at: string | null
          sort_order: number
          status: string
          verified: boolean
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          initials: string
          name: string
          quote: string
          role: string
          scheduled_at?: string | null
          sort_order?: number
          status?: string
          verified?: boolean
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          initials?: string
          name?: string
          quote?: string
          role?: string
          scheduled_at?: string | null
          sort_order?: number
          status?: string
          verified?: boolean
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          award_key: string
          awarded_by: string | null
          badge_id: string
          community_id: string | null
          earned_at: string
          id: string
          note: string | null
          pinned: boolean
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          award_key?: string
          awarded_by?: string | null
          badge_id: string
          community_id?: string | null
          earned_at?: string
          id?: string
          note?: string | null
          pinned?: boolean
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          award_key?: string
          awarded_by?: string | null
          badge_id?: string
          community_id?: string | null
          earned_at?: string
          id?: string
          note?: string | null
          pinned?: boolean
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_challenges: {
        Row: {
          challenge_id: string
          completed_at: string | null
          progress: Json
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          progress?: Json
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          progress?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_quests: {
        Row: {
          comeback: boolean
          completed_at: string | null
          created_at: string
          day: string
          difficulty: string
          id: string
          progress: number
          quest_id: string
          rerolled: boolean
          target_count: number
          user_id: string
        }
        Insert: {
          comeback?: boolean
          completed_at?: string | null
          created_at?: string
          day: string
          difficulty: string
          id?: string
          progress?: number
          quest_id: string
          rerolled?: boolean
          target_count: number
          user_id: string
        }
        Update: {
          comeback?: boolean
          completed_at?: string | null
          created_at?: string
          day?: string
          difficulty?: string
          id?: string
          progress?: number
          quest_id?: string
          rerolled?: boolean
          target_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_quests_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_state: {
        Row: {
          checked_in_at: string | null
          comeback: boolean
          created_at: string
          day: string
          extra_rerolls: number
          rerolls_used: number
          streak_counted: boolean
          sweep_at: string | null
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          comeback?: boolean
          created_at?: string
          day: string
          extra_rerolls?: number
          rerolls_used?: number
          streak_counted?: boolean
          sweep_at?: string | null
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          comeback?: boolean
          created_at?: string
          day?: string
          extra_rerolls?: number
          rerolls_used?: number
          streak_counted?: boolean
          sweep_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_points: {
        Row: {
          comeback_until: string | null
          connection_xp_paused_until: string | null
          created_at: string
          credits_balance: number
          credits_earned: number
          credits_spent: number
          earning_paused_until: string | null
          last_active_date: string | null
          last_ip: string | null
          last_rep_notified_at: string
          last_streak_date: string | null
          leaderboard_banned: boolean
          leaderboard_opt_out: boolean
          legend_stars: number
          level: number
          notify_leaderboard: boolean
          notify_quests_ready: boolean
          notify_rep: boolean
          notify_season: boolean
          notify_streak_risk: boolean
          notify_weekly_recap: boolean
          penalty_level: number
          profile_frame: string | null
          profile_theme: string | null
          quests_notified_on: string | null
          rep_total: number
          streak_best: number
          streak_current: number
          streak_freezes: number
          streak_lost_at: string | null
          streak_lost_value: number | null
          streak_risk_notified_on: string | null
          streak_started_on: string | null
          timezone: string
          top10_notified_week: string | null
          updated_at: string
          user_id: string
          weekly_recap_sent_on: string | null
          xp_total: number
        }
        Insert: {
          comeback_until?: string | null
          connection_xp_paused_until?: string | null
          created_at?: string
          credits_balance?: number
          credits_earned?: number
          credits_spent?: number
          earning_paused_until?: string | null
          last_active_date?: string | null
          last_ip?: string | null
          last_rep_notified_at?: string
          last_streak_date?: string | null
          leaderboard_banned?: boolean
          leaderboard_opt_out?: boolean
          legend_stars?: number
          level?: number
          notify_leaderboard?: boolean
          notify_quests_ready?: boolean
          notify_rep?: boolean
          notify_season?: boolean
          notify_streak_risk?: boolean
          notify_weekly_recap?: boolean
          penalty_level?: number
          profile_frame?: string | null
          profile_theme?: string | null
          quests_notified_on?: string | null
          rep_total?: number
          streak_best?: number
          streak_current?: number
          streak_freezes?: number
          streak_lost_at?: string | null
          streak_lost_value?: number | null
          streak_risk_notified_on?: string | null
          streak_started_on?: string | null
          timezone?: string
          top10_notified_week?: string | null
          updated_at?: string
          user_id: string
          weekly_recap_sent_on?: string | null
          xp_total?: number
        }
        Update: {
          comeback_until?: string | null
          connection_xp_paused_until?: string | null
          created_at?: string
          credits_balance?: number
          credits_earned?: number
          credits_spent?: number
          earning_paused_until?: string | null
          last_active_date?: string | null
          last_ip?: string | null
          last_rep_notified_at?: string
          last_streak_date?: string | null
          leaderboard_banned?: boolean
          leaderboard_opt_out?: boolean
          legend_stars?: number
          level?: number
          notify_leaderboard?: boolean
          notify_quests_ready?: boolean
          notify_rep?: boolean
          notify_season?: boolean
          notify_streak_risk?: boolean
          notify_weekly_recap?: boolean
          penalty_level?: number
          profile_frame?: string | null
          profile_theme?: string | null
          quests_notified_on?: string | null
          rep_total?: number
          streak_best?: number
          streak_current?: number
          streak_freezes?: number
          streak_lost_at?: string | null
          streak_lost_value?: number | null
          streak_risk_notified_on?: string | null
          streak_started_on?: string | null
          timezone?: string
          top10_notified_week?: string | null
          updated_at?: string
          user_id?: string
          weekly_recap_sent_on?: string | null
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_experiences: {
        Row: {
          company: string
          company_id: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          end_label: string
          id: string
          is_current: boolean
          location: string | null
          profile_id: string
          skills: string[]
          sort_order: number
          start_label: string
          title: string
        }
        Insert: {
          company: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_label?: string
          id?: string
          is_current?: boolean
          location?: string | null
          profile_id: string
          skills?: string[]
          sort_order?: number
          start_label: string
          title: string
        }
        Update: {
          company?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_label?: string
          id?: string
          is_current?: boolean
          location?: string | null
          profile_id?: string
          skills?: string[]
          sort_order?: number
          start_label?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_experiences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_experiences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "network_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_experiences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_experiences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "teaming_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      opportunity_saves: {
        Row: {
          created_at: string | null
          id: string | null
          opportunity_id: string | null
          profile_id: string | null
        }
        Relationships: []
      }
      connection_counts: {
        Row: {
          connection_count: number | null
          profile_id: string | null
        }
        Relationships: []
      }
      job_application_counts: {
        Row: {
          applicant_count: number | null
          job_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      network_members: {
        Row: {
          availability: string | null
          avatar_url: string | null
          away_message: string | null
          away_message_enabled: boolean | null
          bio: string | null
          certifications: string[] | null
          clearance: string | null
          clearance_verified: boolean | null
          company_name: string | null
          connections_visible: boolean | null
          capability_statement_name: string | null
          capability_statement_url: string | null
          cover_image_url: string | null
          created_at: string | null
          experience_level: string | null
          first_name: string | null
          govcon_interests: string[] | null
          headline: string | null
          id: string | null
          industries: string[] | null
          job_title: string | null
          languages: string | null
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          naics_interests: string[] | null
          open_to: string[] | null
          phone: string | null
          plan_selection: string | null
          pronouns: string | null
          relationship_goals: string | null
          services: string[] | null
          skills: string[] | null
          slug: string | null
          specialty: string | null
          twitter_url: string | null
          website: string | null
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          away_message?: string | null
          away_message_enabled?: boolean | null
          bio?: string | null
          certifications?: string[] | null
          clearance?: string | null
          clearance_verified?: never
          company_name?: string | null
          connections_visible?: boolean | null
          capability_statement_name?: string | null
          capability_statement_url?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          experience_level?: string | null
          first_name?: string | null
          govcon_interests?: string[] | null
          headline?: string | null
          id?: string | null
          industries?: string[] | null
          job_title?: string | null
          languages?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          naics_interests?: string[] | null
          open_to?: string[] | null
          phone?: string | null
          plan_selection?: string | null
          pronouns?: string | null
          relationship_goals?: string | null
          services?: string[] | null
          skills?: string[] | null
          slug?: string | null
          specialty?: string | null
          twitter_url?: string | null
          website?: string | null
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          away_message?: string | null
          away_message_enabled?: boolean | null
          bio?: string | null
          certifications?: string[] | null
          clearance?: string | null
          clearance_verified?: never
          company_name?: string | null
          connections_visible?: boolean | null
          capability_statement_name?: string | null
          capability_statement_url?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          experience_level?: string | null
          first_name?: string | null
          govcon_interests?: string[] | null
          headline?: string | null
          id?: string | null
          industries?: string[] | null
          job_title?: string | null
          languages?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          naics_interests?: string[] | null
          open_to?: string[] | null
          phone?: string | null
          plan_selection?: string | null
          pronouns?: string | null
          relationship_goals?: string | null
          services?: string[] | null
          skills?: string[] | null
          slug?: string | null
          specialty?: string | null
          twitter_url?: string | null
          website?: string | null
        }
        Relationships: []
      }
      teaming_profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          first_name: string | null
          id: string | null
          industries: string[] | null
          last_name: string | null
          location: string | null
          naics_interests: string[] | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          first_name?: string | null
          id?: string | null
          industries?: string[] | null
          last_name?: string | null
          location?: string | null
          naics_interests?: string[] | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          first_name?: string | null
          id?: string | null
          industries?: string[] | null
          last_name?: string | null
          location?: string | null
          naics_interests?: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      bid_share: { Args: { p_profile: string; p_tracking: string }; Returns: string }
      bid_tracker_ensure_stages: { Args: never; Returns: undefined }
      bid_tracker_set_reminder_days: { Args: { p_days: number[] }; Returns: number[] }
      award_prediction_locks_at: { Args: { p_date: string }; Returns: string }
      capability_review_board: { Args: never; Returns: Json }
      capability_review_mark_helpful: { Args: { p_review: string }; Returns: Json }
      capability_review_request_close: { Args: { p_request: string }; Returns: undefined }
      capability_review_request_open: { Args: { p_note?: string }; Returns: string }
      capability_review_submit: {
        Args: { p_fix: string; p_gaps: string; p_request: string; p_strengths: string }
        Returns: string
      }
      certification_admin_reject: { Args: { p_cert: string; p_note: string }; Returns: undefined }
      certification_admin_verify: {
        Args: { p_cert: string; p_expires_on?: string; p_note?: string; p_sam?: Json; p_source?: string }
        Returns: string
      }
      certification_lapse: { Args: { p_cert: string; p_reason: string; p_sam?: Json }; Returns: boolean }
      certification_request: { Args: { p_cert: string; p_note?: string }; Returns: string }
      company_employee_confirm: { Args: { p_token_hash: string }; Returns: string }
      company_employee_leave: { Args: never; Returns: undefined }
      company_employee_start: {
        Args: { p_company: string; p_email: string; p_token_hash: string }
        Returns: string
      }
      company_leaderboard: { Args: { p_limit?: number; p_month?: string }; Returns: Json }
      company_social_summary: { Args: { p_company: string }; Returns: Json }
      company_verified_certifications: { Args: { p_company: string }; Returns: Json }
      connection_congratulate: { Args: { p_key: string; p_profile: string }; Returns: undefined }
      contract_win_congratulate: { Args: { p_win: string }; Returns: number }
      contract_win_post: {
        Args: {
          p_agency: string
          p_amount?: number
          p_award_date?: string
          p_award_number: string
          p_awardee: string
          p_details?: string
          p_naics?: string
          p_set_aside?: string
          p_title: string
        }
        Returns: string
      }
      contract_win_review: {
        Args: { p_award_data?: Json; p_note?: string; p_verified: boolean; p_win: string }
        Returns: undefined
      }
      contract_win_withdraw: { Args: { p_win: string }; Returns: undefined }
      contract_wins_feed: { Args: never; Returns: Json }
      learning_catalog: { Args: never; Returns: Json }
      learning_lesson_open: { Args: { p_lesson: string; p_path: string }; Returns: Json }
      learning_path: { Args: { p_slug: string }; Returns: Json }
      learning_profile_summary: { Args: { p_user: string }; Returns: Json }
      learning_quiz_submit: { Args: { p_answers: number[]; p_lesson: string }; Returns: Json }
      mentor_profile_save: {
        Args: { p_accepting: boolean; p_bio: string; p_topics: string[] }
        Returns: undefined
      }
      mentor_session_confirm: {
        Args: { p_confirm: boolean; p_note?: string; p_session: string }
        Returns: Json
      }
      mentor_session_log: {
        Args: { p_date: string; p_mentorship: string; p_minutes: number; p_topic: string }
        Returns: string
      }
      mentoring_board: { Args: never; Returns: Json }
      mentorship_end: { Args: { p_mentorship: string }; Returns: undefined }
      mentorship_request: { Args: { p_mentor: string; p_message: string }; Returns: string }
      mentorship_respond: { Args: { p_accept: boolean; p_mentorship: string }; Returns: undefined }
      network_celebrations: { Args: never; Returns: Json }
      prediction_admin_resolve: {
        Args: { p_award_data?: Json; p_award_number?: string; p_option: string; p_prediction: string }
        Returns: number
      }
      prediction_admin_void: { Args: { p_prediction: string; p_reason: string }; Returns: undefined }
      prediction_pick: { Args: { p_option: string; p_prediction: string }; Returns: Json }
      prediction_season_finalize: { Args: { p_force?: boolean; p_season: string }; Returns: number }
      predictions_board: { Args: { p_season?: string }; Returns: Json }
      profile_skill_endorsements: { Args: { p_profile: string }; Returns: Json }
      skill_endorse: { Args: { p_profile: string; p_skill: string }; Returns: Json }
      skill_unendorse: { Args: { p_profile: string; p_skill: string }; Returns: Json }
      store_admin_add_codes: { Args: { p_codes: string; p_reward: string }; Returns: number }
      store_admin_overview: { Args: never; Returns: Json }
      store_admin_save_perk: {
        Args: {
          p_active: boolean
          p_description: string
          p_id: string | null
          p_instructions: string
          p_limit_count: number | null
          p_limit_period: string | null
          p_name: string
          p_partner_company: string | null
          p_partner_url: string
          p_price: number
          p_shared_code: string
        }
        Returns: string
      }
      store_admin_set_expert: {
        Args: { p_active: boolean; p_calls: boolean; p_note?: string; p_profile: string; p_reviews: boolean }
        Returns: undefined
      }
      store_admin_set_file: { Args: { p_name: string; p_path: string; p_reward: string }; Returns: undefined }
      store_download: { Args: { p_redemption: string }; Returns: Json }
      store_expert_assign: { Args: { p_expert: string; p_redemption: string }; Returns: undefined }
      store_expert_deliver: {
        Args: { p_feedback: string; p_file_name?: string; p_file_path?: string; p_redemption: string }
        Returns: undefined
      }
      store_expert_queue: { Args: never; Returns: Json }
      store_expert_schedule: { Args: { p_at: string; p_meeting_url: string; p_redemption: string }; Returns: undefined }
      store_my_requests: { Args: never; Returns: Json }
      store_request_expert: {
        Args: {
          p_availability?: string
          p_code: string
          p_file_name?: string
          p_file_path?: string
          p_link?: string
          p_notes: string
        }
        Returns: Json
      }
      store_status: { Args: never; Returns: Json }
      store_ticket_events: { Args: never; Returns: Json }
      streak_buddy_cancel: { Args: { p_id: string }; Returns: undefined }
      streak_buddy_candidates: { Args: { p_query?: string }; Returns: Json }
      streak_buddy_end: { Args: { p_id: string }; Returns: undefined }
      streak_buddy_invite: { Args: { p_partner: string }; Returns: string }
      streak_buddy_respond: { Args: { p_accept: boolean; p_id: string }; Returns: undefined }
      streak_buddy_state: { Args: never; Returns: Json }
      teaming_board: { Args: never; Returns: Json }
      teaming_confirm: { Args: { p_response: string }; Returns: Json }
      teaming_need_close: { Args: { p_need: string }; Returns: undefined }
      teaming_need_create: {
        Args: {
          p_agency?: string
          p_details: string
          p_naics?: string
          p_opportunity?: string
          p_respond_by?: string
          p_role: string
          p_set_aside?: string
          p_title: string
          p_vehicle?: string
        }
        Returns: string
      }
      teaming_respond: { Args: { p_message: string; p_need: string }; Returns: string }
      teaming_response_close: { Args: { p_response: string }; Returns: undefined }
      admin_set_community_moderator: {
        Args: {
          make_moderator: boolean
          target_community_id: string
          target_profile_id: string
        }
        Returns: undefined
      }
      applicant_meets_job_clearance: {
        Args: { applicant: string; target_job: string }
        Returns: boolean
      }
      approve_community_member: {
        Args: { target_community_id: string; target_profile_id: string }
        Returns: undefined
      }
      are_connected: { Args: { a: string; b: string }; Returns: boolean }
      clearance_rank: { Args: { label: string }; Returns: number }
      comment_follower_ids: {
        Args: { target_comment_id: string }
        Returns: string[]
      }
      company_admin_profile_ids: {
        Args: { target_company_id: string }
        Returns: string[]
      }
      company_analytics: {
        Args: { days?: number; target_company_id: string }
        Returns: Json
      }
      company_follower_count: {
        Args: { target_company_id: string }
        Returns: number
      }
      company_followers: {
        Args: { target_company_id: string }
        Returns: {
          followed_at: string
          profile_id: string
        }[]
      }
      company_partner_eligibility: {
        Args: { p_company_id: string }
        Returns: Json
      }
      confirm_company_business_email: {
        Args: { p_token_hash: string }
        Returns: string
      }
      daily_question_suggest: {
        Args: { p_options: string[]; p_question: string }
        Returns: string
      }
      daily_question_today: { Args: never; Returns: Json }
      daily_question_vote: { Args: { p_option: string }; Returns: Json }
      double_xp_admin_cancel: { Args: { p_id: string }; Returns: undefined }
      double_xp_admin_schedule: {
        Args: { p_local: string; p_minutes?: number }
        Returns: string
      }
      double_xp_now: { Args: never; Returns: Json }
      surprise_admin_stats: { Args: never; Returns: Json }
      decline_community_invite: {
        Args: { target_community_id: string }
        Returns: undefined
      }
      get_event_attendee_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          approved_count: number
          event_id: string
        }[]
      }
      get_event_attendees: {
        Args: { p_event_id: string }
        Returns: {
          avatar_url: string
          first_name: string
          headline: string
          job_title: string
          last_name: string
          profile_id: string
          registered_at: string
          registration_id: string
          status: string
        }[]
      }
      get_mutual_connection_ids: {
        Args: { target_profile_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      invite_to_community: {
        Args: { target_community_id: string; target_profile_id: string }
        Returns: undefined
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_community_moderator: {
        Args: { target_community_id: string; target_profile_id: string }
        Returns: boolean
      }
      is_company_admin: {
        Args: { target_company_id: string; uid: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { target_company_id: string; uid: string }
        Returns: boolean
      }
      is_email_confirmed: { Args: { uid: string }; Returns: boolean }
      is_placeholder_profile_slug: { Args: { value: string }; Returns: boolean }
      is_pro: { Args: { uid: string }; Returns: boolean }
      job_accepting_applications: {
        Args: { target_job: string }
        Returns: boolean
      }
      join_community: { Args: { target_community_id: string }; Returns: string }
      moderate_post: {
        Args: {
          p_action: string
          p_reason?: string
          p_target_community_id?: string
          target_post_id: string
        }
        Returns: undefined
      }
      next_company_slug: { Args: { p_base: string }; Returns: string }
      claim_notification_email: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      notification_send_context: {
        Args: { target_profile_id: string }
        Returns: {
          account_email: boolean
          account_in_app: boolean
          billing_email: boolean
          billing_in_app: boolean
          connections_email: boolean
          connections_in_app: boolean
          email: string
          events_email: boolean
          events_in_app: boolean
          first_name: string
          following_email: boolean
          following_in_app: boolean
          jobs_email: boolean
          jobs_in_app: boolean
          messages_email: boolean
          messages_in_app: boolean
          moderation_email: boolean
          moderation_in_app: boolean
          opportunities_email: boolean
          opportunities_in_app: boolean
          posts_email: boolean
          posts_in_app: boolean
          rewards_email: boolean
          rewards_in_app: boolean
          security_email: boolean
          security_in_app: boolean
          teaming_email: boolean
          teaming_in_app: boolean
        }[]
      }
      opportunity_match_decide: {
        Args: { p_decision: string; p_match: string }
        Returns: Json
      }
      opportunity_match_open: { Args: { p_match: string }; Returns: undefined }
      opportunity_matches_today: { Args: never; Returns: Json }
      opportunity_accepting_responses: {
        Args: { target_opportunity: string }
        Returns: boolean
      }
      people_also_viewed: {
        Args: {
          exclude_profile?: string
          max_results?: number
          target_profile: string
        }
        Returns: {
          co_viewers: number
          profile_id: string
        }[]
      }
      points_account_trusted: { Args: { p_user: string }; Returns: boolean }
      points_active_boosts: {
        Args: { p_kind: string }
        Returns: {
          expires_at: string
          target_id: string
        }[]
      }
      points_admin_adjust: {
        Args: {
          p_credits: number
          p_reason: string
          p_rep: number
          p_user: string
          p_xp: number
        }
        Returns: undefined
      }
      points_admin_award_badge: {
        Args: {
          p_code: string
          p_community: string
          p_note: string
          p_user: string
        }
        Returns: boolean
      }
      points_admin_decide_redemption: {
        Args: { p_approve: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      points_admin_finalize_season: {
        Args: { p_season: string }
        Returns: undefined
      }
      points_admin_lift_penalty: {
        Args: { p_reason: string; p_user: string; p_what: string }
        Returns: undefined
      }
      points_admin_log: {
        Args: {
          p_action: string
          p_detail?: Json
          p_reason: string
          p_user: string
        }
        Returns: undefined
      }
      points_admin_penalty: {
        Args: {
          p_level: number
          p_reason: string
          p_since?: string
          p_user: string
        }
        Returns: undefined
      }
      points_admin_resolve_flag: {
        Args: { p_flag: string; p_note: string; p_status: string }
        Returns: undefined
      }
      points_admin_reverse_account: {
        Args: { p_reason: string; p_since: string; p_user: string }
        Returns: number
      }
      points_admin_reverse_event: {
        Args: { p_event: string; p_reason: string }
        Returns: undefined
      }
      points_admin_reverse_source: {
        Args: { p_reason: string; p_source_id: string; p_source_type: string }
        Returns: number
      }
      points_admin_revoke_badge: {
        Args: { p_reason: string; p_user_badge: string }
        Returns: undefined
      }
      points_award_badge: {
        Args: {
          p_award_key?: string
          p_by?: string
          p_code: string
          p_community?: string
          p_note?: string
          p_user: string
        }
        Returns: boolean
      }
      points_check_automation: { Args: { p_user: string }; Returns: undefined }
      points_check_badges: {
        Args: { p_metrics?: string[]; p_user: string }
        Returns: undefined
      }
      points_check_badges_for_action: {
        Args: { p_action: string; p_user: string }
        Returns: undefined
      }
      points_check_level: { Args: { p_user: string }; Returns: undefined }
      points_check_night_shift: {
        Args: { p_comment_id: string }
        Returns: undefined
      }
      points_check_profile_milestones: {
        Args: { p_user: string }
        Returns: undefined
      }
      points_current_challenge: { Args: { p_user: string }; Returns: Json }
      points_daily_checkin: {
        Args: { p_ip?: string; p_timezone?: string }
        Returns: Json
      }
      points_daily_jobs: { Args: never; Returns: undefined }
      points_decide_highlight: {
        Args: { p_approve: boolean; p_reason?: string; p_redemption: string }
        Returns: undefined
      }
      points_ensure_quests: { Args: { p_user: string }; Returns: undefined }
      points_ensure_user: { Args: { p_user: string }; Returns: undefined }
      points_ensure_weekly_challenge: { Args: never; Returns: undefined }
      points_event_attendance: {
        Args: { p_event: string }
        Returns: {
          attendance_method: string
          attended_at: string
          minutes: number
          profile_id: string
        }[]
      }
      points_event_checkin: { Args: { p_code: string }; Returns: Json }
      resource_download_file: { Args: { p_id: string }; Returns: Json }
      resource_library: {
        Args: never
        Returns: {
          access_state: string
          id: string
          link_domain: string | null
          video_thumbnail_url: string | null
          thumbnail_url: string | null
        }[]
      }
      resource_reorder: { Args: { p_ids: string[] }; Returns: undefined }
      resource_url_taken: { Args: { p_url: string; p_except?: string }; Returns: boolean }
      record_resource_event: { Args: { p_id: string; p_kind: string }; Returns: undefined }
      log_resource_search: { Args: { p_query: string }; Returns: undefined }
      request_resource: { Args: { p_topic: string; p_details: string }; Returns: undefined }
      record_pro_upgrade_event: { Args: { p_source: string; p_kind: string; p_resource?: string }; Returns: undefined }
      resource_analytics: {
        Args: { p_days?: number }
        Returns: { resource_id: string; views: number; clicks: number; saves: number; unique_members: number }[]
      }
      resource_library_insights: { Args: { p_days?: number }; Returns: Json }
      my_unavailable_saved_resources: {
        Args: never
        Returns: { resource_id: string; title: string; saved_at: string }[]
      }
      my_resource_submissions: {
        Args: never
        Returns: {
          id: string
          slug: string
          title: string
          type: string
          category_id: string | null
          kind: string
          description: string
          url: string | null
          submission_status: string
          review_note: string | null
          created_at: string
          reviewed_at: string | null
          is_live: boolean
        }[]
      }
      resubmit_member_resource: {
        Args: { p_id: string; p_title: string; p_type: string; p_category: string; p_description: string; p_url: string }
        Returns: undefined
      }
      resource_open: { Args: { p_id: string }; Returns: Json }
      submit_member_resource: {
        Args: { p_title: string; p_type: string; p_category: string; p_description: string; p_url: string; p_kind?: string }
        Returns: string
      }
      points_event_ping: { Args: { p_event: string }; Returns: Json }
      points_finalize_season: { Args: { p_season: string }; Returns: undefined }
      points_grant_pro: {
        Args: { p_days: number; p_reason: string; p_user: string }
        Returns: undefined
      }
      points_hourly: { Args: never; Returns: undefined }
      points_industry_matches: {
        Args: { p_community_name: string; p_industry: string; p_topic: string }
        Returns: boolean
      }
      points_is_vote_ring: {
        Args: { p_target: string; p_voter: string }
        Returns: boolean
      }
      points_is_workday: { Args: { p_day: string }; Returns: boolean }
      points_leaderboard: {
        Args: {
          p_board: string
          p_community?: string
          p_limit?: number
          p_period?: string
        }
        Returns: Json
      }
      points_level_for: { Args: { p_xp: number }; Returns: number }
      points_local_day: {
        Args: { p_at?: string; p_user: string }
        Returns: string
      }
      points_mark_attendance: {
        Args: { p_attended: boolean; p_event: string; p_profile: string }
        Returns: undefined
      }
      points_mark_streak: { Args: { p_user: string }; Returns: undefined }
      points_member_level: { Args: { p_user: string }; Returns: number }
      points_meta_matches: {
        Args: { p_community: string; p_filters: Json; p_meta: Json }
        Returns: boolean
      }
      points_metric: {
        Args: { p_metric: string; p_user: string }
        Returns: number
      }
      points_my_summary: { Args: never; Returns: Json }
      points_nominate_best_answer: {
        Args: { p_comment: string }
        Returns: Json
      }
      points_notify: {
        Args: {
          p_actor?: string
          p_body?: string
          p_link?: string
          p_subject_id?: string
          p_subject_type?: string
          p_title: string
          p_type: string
          p_user: string
        }
        Returns: undefined
      }
      points_on_post_published: {
        Args: { p: Database["public"]["Tables"]["posts"]["Row"] }
        Returns: undefined
      }
      points_penalize_content: {
        Args: {
          p_actor: string
          p_author: string
          p_reason: string
          p_source_id: string
          p_source_type: string
        }
        Returns: undefined
      }
      points_pick_quest: {
        Args: {
          p_difficulty: string
          p_exclude: string[]
          p_set: string
          p_user: string
        }
        Returns: string
      }
      points_pin_badge: {
        Args: { p_pinned: boolean; p_user_badge: string }
        Returns: undefined
      }
      points_plain_text: { Args: { p_body: string }; Returns: string }
      points_prev_workday: { Args: { p_day: string }; Returns: string }
      points_profile: { Args: { p_user: string }; Returns: Json }
      points_profile_completeness: { Args: { p_user: string }; Returns: number }
      points_progress: {
        Args: {
          p_action: string
          p_community: string
          p_meta: Json
          p_user: string
        }
        Returns: undefined
      }
      points_public_summaries: {
        Args: { p_community?: string; p_ids: string[] }
        Returns: {
          is_legend: boolean
          legend_stars: number
          level: number
          pinned: Json
          profile_frame: string
          profile_theme: string
          rank_name: string
          rep: number
          streak: number
          top_contributor: string
          user_id: string
        }[]
      }
      points_quest_eligible: {
        Args: { p_requires: string; p_user: string }
        Returns: boolean
      }
      points_queue_email: {
        Args: {
          p_body: string
          p_cta_label?: string
          p_cta_path?: string
          p_kind: string
          p_subject: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      points_rank_name: { Args: { p_level: number }; Returns: string }
      points_record: {
        Args: {
          p_action: string
          p_actor?: string
          p_community?: string
          p_credits?: number
          p_key: string
          p_meta?: Json
          p_rep?: number
          p_source_id?: string
          p_source_type?: string
          p_user: string
          p_xp?: number
        }
        Returns: string
      }
      points_redeem: {
        Args: { p_code: string; p_target_id?: string; p_target_type?: string }
        Returns: Json
      }
      points_refund_redemption: {
        Args: { p_by: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      points_require_admin: { Args: never; Returns: string }
      points_undo_redemption: { Args: { p_id: string }; Returns: Json }
      points_reroll_quest: { Args: { p_row: string }; Returns: Json }
      points_restore_content: {
        Args: {
          p_actor: string
          p_author: string
          p_source_id: string
          p_source_type: string
        }
        Returns: undefined
      }
      points_reverse: {
        Args: {
          p_actions: string[]
          p_by?: string
          p_key: string
          p_reason: string
          p_user: string
        }
        Returns: number
      }
      points_reverse_source: {
        Args: {
          p_actions?: string[]
          p_by?: string
          p_reason: string
          p_source_id: string
          p_source_type: string
          p_user?: string
        }
        Returns: number
      }
      points_set_best_answer: {
        Args: { p_comment: string; p_post: string }
        Returns: undefined
      }
      points_set_preferences: { Args: { p_prefs: Json }; Returns: Json }
      points_setting_bool: {
        Args: { p_default: boolean; p_key: string }
        Returns: boolean
      }
      points_setting_num: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      points_settle_streak: { Args: { p_user: string }; Returns: undefined }
      points_settle_votes: { Args: never; Returns: number }
      points_streak_multiplier: { Args: { p_streak: number }; Returns: number }
      points_tz: { Args: { p_user: string }; Returns: string }
      points_week_start: { Args: never; Returns: string }
      points_worth_a_read: {
        Args: { p_community: string }
        Returns: {
          author_id: string
          author_name: string
          body: string
          expires_at: string
          post_id: string
          redemption_id: string
          slug: string
          title: string
        }[]
      }
      post_follower_ids: { Args: { target_post_id: string }; Returns: string[] }
      profile_connection_ids: {
        Args: { target_profile_id: string }
        Returns: {
          connected_at: string
          profile_id: string
        }[]
      }
      profile_followed_company_ids: {
        Args: { target_profile_id: string }
        Returns: {
          company_id: string
          followed_at: string
        }[]
      }
      record_company_view: {
        Args: { target_company_id: string }
        Returns: undefined
      }
      reject_community_member: {
        Args: { target_community_id: string; target_profile_id: string }
        Returns: undefined
      }
      remove_community_member: {
        Args: { target_community_id: string; target_profile_id: string }
        Returns: undefined
      }
      request_company_deletion: {
        Args: { reason: string; target_company_id: string }
        Returns: undefined
      }
      request_company_verification: {
        Args: { note: string; proof_path: string; target_company_id: string }
        Returns: undefined
      }
      respond_partner_info_request: {
        Args: { p_attachments?: Json; p_inquiry_id: string; p_response: string }
        Returns: undefined
      }
      respond_to_event_registration: {
        Args: { p_event_id: string; p_profile_id: string; p_status: string }
        Returns: undefined
      }
      review_partner_application: {
        Args: { p_decision: string; p_inquiry_id: string; p_note?: string }
        Returns: undefined
      }
      revoke_company_partner: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      send_event_reminders: { Args: never; Returns: undefined }
      set_community_member_muted: {
        Args: {
          muted: boolean
          target_community_id: string
          target_profile_id: string
        }
        Returns: undefined
      }
      set_community_member_role: {
        Args: {
          new_role: string
          target_community_id: string
          target_profile_id: string
        }
        Returns: undefined
      }
      set_job_closed: {
        Args: { closed: boolean; target_job: string }
        Returns: undefined
      }
      set_opportunity_closed: {
        Args: { closed: boolean; target_opportunity: string }
        Returns: undefined
      }
      slugify_name: {
        Args: { first_name: string; last_name: string }
        Returns: string
      }
      start_company_email_verification: {
        Args: { p_company_id: string; p_token_hash: string }
        Returns: string
      }
      submit_member_event: {
        Args: {
          p_description: string
          p_format: string
          p_image_url: string
          p_location: string
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      submit_partner_application: {
        Args: {
          p_agree_to_guidelines: boolean
          p_company_id: string
          p_contact_email: string
          p_contact_name: string
          p_message: string
          p_no_federal_ids: boolean
          p_partner_type: string
        }
        Returns: string
      }
      update_company_identity: {
        Args: {
          p_cage_code: string
          p_legal_name: string
          p_uei: string
          target_company_id: string
        }
        Returns: string
      }
      update_company_media: {
        Args: { field: string; new_url: string; target_company_id: string }
        Returns: undefined
      }
      update_company_profile: {
        Args: {
          p_agencies_served: string[]
          p_business_email: string
          p_company_size: string
          p_contract_vehicles: string[]
          p_contract_vehicles_note?: string
          p_core_specialties?: string
          p_keywords: string[]
          p_location: string
          p_naics_codes: string[]
          p_overview: string
          p_ownership: string
          p_phone: string
          p_psc_codes: string[]
          p_service_areas: string[]
          p_services: string[]
          p_tagline: string
          p_type?: string
          p_website: string
          p_year_founded: number
          target_company_id: string
        }
        Returns: undefined
      }
      withdraw_company_verification: {
        Args: { target_company_id: string }
        Returns: string
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
