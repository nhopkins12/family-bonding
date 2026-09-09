// The family runs on Toronto time, so "today" always means today in Toronto,
// regardless of which timezone a viewer's own device happens to be set to.
// Shared between WatchPlanner and EventEditorModal — kept in one place so the two
// never quietly drift out of sync on what "today" means.
const TIME_ZONE = 'America/Toronto'
const torontoDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Today's date key (YYYY-MM-DD) in Toronto time — en-CA formats as YYYY-MM-DD directly. */
export function todayKey() {
  return torontoDateFormatter.format(new Date())
}
