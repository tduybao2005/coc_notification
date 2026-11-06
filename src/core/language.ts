export type Language = 'vi' | 'en';

export function deviceLanguage(tag: string): Language {
  return tag.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
