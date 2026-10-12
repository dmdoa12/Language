const SEOUL_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// YYYY-MM-DD (Asia/Seoul)
export function seoulDateKey(at: Date | number): string {
  return SEOUL_FORMAT.format(typeof at === 'number' ? new Date(at) : at);
}
