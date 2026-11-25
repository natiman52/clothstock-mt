import apiClient from './client';

export async function fetchServerEventExport(storeId = 'all', afterSeq = 0) {
  const events = [];
  let cursor = Number(afterSeq) || 0;
  let firstPage = null;

  while (true) {
    const params = new URLSearchParams({
      store_id: storeId || 'all',
      after_seq: String(cursor),
      limit: '1000',
    });
    const page = await apiClient.get(`/api/sync/events/export/?${params}`);
    firstPage ||= page;
    events.push(...(page.events || []));

    if (!page.has_more) break;
    const nextCursor = Number(page.next_after_seq);
    if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
      throw new Error('Server event export returned an invalid pagination cursor.');
    }
    cursor = nextCursor;
  }

  return {
    ...firstPage,
    after_seq: Number(afterSeq) || 0,
    latest_seq: events.at(-1)?.seq_id ?? (Number(afterSeq) || 0),
    next_after_seq: null,
    has_more: false,
    count: events.length,
    events,
  };
}

export function importStoreSyncExport(document) {
  return apiClient.post('/api/sync/bundle/', document);
}
