import { deviceLanguage } from '../src/core/language';

test.each([['vi', 'vi'], ['vi-VN', 'vi'], ['VI', 'vi'], ['en-US', 'en'], ['', 'en'], ['fr', 'en']] as const)(
  'device language %j is %s', (tag, expected) => {
    expect(deviceLanguage(tag)).toBe(expected);
  });
