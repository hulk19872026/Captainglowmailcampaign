import { env } from '../lib/env';
import { isValidEmail, normalizeEmail, findEmailInText, stripEmailFromText } from '../lib/util';

const ENDPOINT = 'https://gql.waveapps.com/graphql/public';

export function waveConfigured() {
  return !!env.waveToken;
}

async function gql(queryText: string, variables: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.waveToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryText, variables }),
    signal: AbortSignal.timeout(30000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error('Wave rejected the API token. Check WAVE_API_TOKEN.');
  if (!res.ok) throw new Error(`Wave replied with HTTP ${res.status}`);
  if (body.errors?.length) throw new Error(`Wave error: ${body.errors.map((e: any) => e.message).join('; ')}`);
  return body.data;
}

export async function listWaveBusinesses(): Promise<{ id: string; name: string; isPersonal: boolean }[]> {
  const data = await gql(`query { businesses(page: 1, pageSize: 50) { edges { node { id name isPersonal } } } }`, {});
  return (data?.businesses?.edges || []).map((e: any) => e.node);
}

export interface WaveCustomer {
  waveId: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

const CUSTOMERS_QUERY = `query ($businessId: ID!, $page: Int!, $pageSize: Int!) {
  business(id: $businessId) {
    id
    customers(page: $page, pageSize: $pageSize, sort: [NAME_ASC]) {
      pageInfo { currentPage totalPages totalCount }
      edges { node {
        id name firstName lastName email phone mobile isArchived
        address { addressLine1 city postalCode province { name code } }
      } }
    }
  }
}`;

/**
 * Pulls every Wave customer. Only customers with a valid email come back.
 * If the Email field is blank, an address typed into the contact first/last
 * name is used instead (and removed from the name).
 */
export async function fetchWaveCustomers(businessId: string): Promise<{ customers: WaveCustomer[]; skipped: number }> {
  const out: WaveCustomer[] = [];
  let skipped = 0;
  let page = 1;
  let totalPages = 1;
  do {
    const data = await gql(CUSTOMERS_QUERY, { businessId, page, pageSize: 100 });
    if (!data?.business) throw new Error('Wave could not find that business. Check the business ID in Settings.');
    const conn = data.business.customers;
    totalPages = conn?.pageInfo?.totalPages || 1;
    for (const { node } of conn?.edges || []) {
      if (node.isArchived) { skipped++; continue; }
      let email = normalizeEmail(node.email);
      let first: string | null = node.firstName || null;
      let last: string | null = node.lastName || null;
      if (!email || !isValidEmail(email)) {
        email = findEmailInText(first) || findEmailInText(last);
      }
      // Keep any typed-in email address out of the name either way.
      first = stripEmailFromText(first) || null;
      last = stripEmailFromText(last) || null;
      if (!email || !isValidEmail(email)) { skipped++; continue; }
      const display = stripEmailFromText(node.name) || null;
      if (!first && !last && display) {
        // No contact name: use the customer name, split into first / last.
        const parts = display.split(' ');
        first = parts[0];
        last = parts.slice(1).join(' ') || null;
      }
      const contactName = [first, last].filter(Boolean).join(' ');
      out.push({
        waveId: String(node.id),
        email,
        first_name: first,
        last_name: last,
        company_name: display && display !== contactName ? display : null,
        phone: node.mobile || node.phone || null,
        address_line: node.address?.addressLine1 || null,
        city: node.address?.city || null,
        state: node.address?.province?.code || node.address?.province?.name || null,
        postal_code: node.address?.postalCode || null,
      });
    }
    page++;
  } while (page <= totalPages && page <= 200);
  return { customers: out, skipped };
}
