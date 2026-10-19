import type { Recurrence } from '@recurrence';

export type Align = 'left' | 'center' | 'right';
export type Block =
  | { id: string; type: 'logo'; align?: Align; width?: number }
  | { id: string; type: 'headline'; text: string; size?: 'lg' | 'md' | 'sm'; align?: Align }
  | { id: string; type: 'paragraph'; text: string; align?: Align }
  | { id: string; type: 'image'; url: string; alt?: string; link?: string }
  | { id: string; type: 'flyer'; url: string; alt?: string; link?: string }
  | { id: string; type: 'button'; text: string; url: string; leadLabel?: string; align?: Align }
  | { id: string; type: 'text_us'; text: string; message?: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height?: number }
  | { id: string; type: 'services'; title?: string }
  | { id: string; type: 'plans'; title?: string; planIds: string[] };
export type BlockType = Block['type'];

export interface Plan { id: string; name: string; price: string; tagline: string; features: string[] }

export interface Settings {
  company_name: string; short_name: string; website: string; company_phone: string; tagline: string;
  mailing_address: string; timezone: string; send_time: string; daily_limit: number; sms_daily_limit: number;
  batch_size: number; batch_delay_seconds: number; logo_url: string; accent_color: string;
  from_name: string; from_email: string; reply_to: string;
  sms_enabled: boolean; sms_text_us_number: string; sms_text_us_message: string; sms_opt_out_text: string;
  nightly_sync_enabled: boolean; nightly_sync_hour: number; wave_business_id: string;
  services: string[]; plans: Plan[];
}

export interface Audience {
  type: 'all' | 'filters' | 'groups';
  groupIds?: number[];
  filters?: { search?: string; city?: string; source?: string; addedWithinDays?: number; notEmailedWithinDays?: number };
}

export interface Campaign {
  id: number; name: string; channel: 'email' | 'sms'; status: string; template_id: number | null;
  subject: string; preheader: string; blocks: Block[]; sms_body: string; audience: Audience; recurrence: Recurrence;
  from_name: string | null; from_email: string | null; reply_to: string | null;
  test_mode: boolean; test_email: string | null; test_phone: string | null;
  current_occurrence: number; next_run_date: string | null; occurrences_done: number;
  created_at: string; started_at: string | null; completed_at: string | null;
  total?: number; queued?: number; sent?: number; failed?: number; skipped?: number; opened?: number; clicked?: number; leads?: number;
}

export interface Template { id: number; name: string; description: string; subject: string; preheader: string; blocks: Block[]; is_starter: boolean; updated_at: string }
export interface Group { id: number; name: string; description: string | null; member_count: number; emailable_count: number; textable_count: number; updated_at: string }
export interface Customer {
  id: number; external_id: string | null; source: string; first_name: string | null; last_name: string | null; company_name: string | null;
  email: string | null; phone: string | null; address_line: string | null; city: string | null; state: string | null; postal_code: string | null;
  notes: string | null; disabled: boolean; unsubscribed: boolean; sms_consent: boolean; suppressed: boolean; sms_opted_out: boolean;
  last_emailed_at: string | null; created_at: string;
}
