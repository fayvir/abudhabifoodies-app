import { pick } from '../../testing/builders';
import { buildShareText } from '../share';

const FOOTER = 'Find more on Abu Dhabi Foodies: https://abudhabifoodies.ae';

describe('buildShareText', () => {
  it('is the name, note, cuisine/area and link, with no emoji', () => {
    const text = buildShareText(pick({ cuisine: ['Lebanese', 'Arabic'], area: 'Al Reem Island' }));
    expect(text).toBe(
      ['Operation Falafel', '"Best hummus in town"', 'Lebanese, Arabic · Al Reem Island', FOOTER].join('\n'),
    );
  });

  it('omits the note line when there is no note', () => {
    expect(buildShareText(pick({ note: null }))).not.toContain('"');
  });

  it('omits the cuisine/area line when both are empty', () => {
    expect(buildShareText(pick({ cuisine: [], area: null, note: null }))).toBe(['Operation Falafel', FOOTER].join('\n'));
  });

  it('tolerates a null cuisine and area', () => {
    const text = buildShareText(pick({ cuisine: null as unknown as string[], area: null, note: null }));
    expect(text).toBe(['Operation Falafel', FOOTER].join('\n'));
  });

  it('carries the sponsored disclosure with the advertiser right after the name', () => {
    const text = buildShareText(pick({ is_sponsored: true, advertiser_name: 'Acme Hospitality' }));
    expect(text.split('\n').slice(0, 2)).toEqual(['Operation Falafel', 'Sponsored · Acme Hospitality']);
  });

  it('carries the disclosure without a dot when the advertiser is blank', () => {
    const text = buildShareText(pick({ is_sponsored: true, advertiser_name: '' }));
    expect(text.split('\n')[1]).toBe('Sponsored');
  });

  it('has no sponsored line for an editorial pick', () => {
    expect(buildShareText(pick({ is_sponsored: false }))).not.toContain('Sponsored');
  });
});
