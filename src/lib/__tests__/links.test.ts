import { directionsUrl, feedbackUrl, instagramUrl, reserveUrl, telUrl } from '../links';

describe('outbound links (built as the website builds them)', () => {
  it('call is tel: plus the raw phone, no normalisation', () => {
    expect(telUrl('+971 2 555 0100')).toBe('tel:+971 2 555 0100');
  });

  it('directions is the google_maps url as-is', () => {
    expect(directionsUrl('https://maps.google.com/?cid=1')).toBe('https://maps.google.com/?cid=1');
  });

  it('reserve is the website url as-is', () => {
    expect(reserveUrl('https://example.com/book?x=1')).toBe('https://example.com/book?x=1');
  });

  it.each([[null], [undefined], ['']])('every builder returns null for %p', (v) => {
    expect(telUrl(v)).toBeNull();
    expect(directionsUrl(v)).toBeNull();
    expect(reserveUrl(v)).toBeNull();
  });
});

describe('instagramUrl', () => {
  it.each([
    'https://www.instagram.com/reel/XYZ/',
    'https://instagram.com/p/XYZ',
    'https://www.instagram.com/p/ABC/?igsh=1',
  ])('accepts %s', (u) => {
    expect(instagramUrl(u)).toBe(u);
  });

  it.each([
    ['http scheme', 'http://www.instagram.com/p/XYZ'],
    ['other host', 'https://example.com/p/XYZ'],
    ['lookalike host', 'https://instagram.com.evil.com/p/XYZ'],
    ['subdomain trick', 'https://evilinstagram.com/p/XYZ'],
    ['credentials trick', 'https://instagram.com@evil.com/p/XYZ'],
    ['javascript', 'javascript:alert(1)'],
    ['empty', ''],
    ['not a url', 'instagram.com/p/XYZ'],
    ['profile, not a post or Reel', 'https://www.instagram.com/abudhabifoodies/'],
    ['bare host', 'https://instagram.com'],
    ['stories', 'https://www.instagram.com/stories/abudhabifoodies/1/'],
  ])('rejects %s', (_n, u) => {
    expect(instagramUrl(u)).toBeNull();
  });

  it.each([[null], [undefined], [42], [{}]])('rejects non-string %p', (v) => {
    expect(instagramUrl(v)).toBeNull();
  });
});

describe('feedbackUrl', () => {
  it('addresses contact@abudhabifoodies.ae with a subject', () => {
    expect(feedbackUrl(null)).toBe('mailto:contact@abudhabifoodies.ae?subject=Abu%20Dhabi%20Foodies%20app%20feedback&body=');
  });

  it('puts the app version and build in the body', () => {
    const url = feedbackUrl('1.0.0 (3.1)');
    expect(decodeURIComponent(url.split('body=')[1])).toBe('\n\n--\nApp 1.0.0 (3.1)');
  });
});
