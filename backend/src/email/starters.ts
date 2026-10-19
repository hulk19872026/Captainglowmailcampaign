import { one, query } from '../lib/db';
import { log } from '../lib/log';
import type { Block } from './blocks';

let n = 0;
const id = () => `s${++n}`;

export const STARTER_TEMPLATES: { name: string; description: string; subject: string; preheader: string; blocks: Block[] }[] = [
  {
    name: 'Birthday party packages',
    description: 'Shows your BASIC, PRO and ELITE birthday party packages with a "Book a party" button that records a lead.',
    subject: '{{first_name|Hey}}, celebrate your next birthday in the glow!',
    preheader: 'Pick a party package: BASIC, PRO or ELITE. We handle the fun, you take the photos.',
    blocks: [
      { id: id(), type: 'logo', align: 'center' },
      { id: id(), type: 'headline', text: 'Birthday parties that glow!', size: 'lg', align: 'center' },
      {
        id: id(), type: 'paragraph', align: 'left',
        text: "Hi {{first_name|there}},\n\nLooking for a birthday party the kids will actually talk about? At {{company_name}} the whole party plays glow-in-the-dark mini golf, hits the arcade, and we take care of the setup and the clean-up.\n\nPick the package that fits your crew:",
      },
      { id: id(), type: 'plans', title: 'Our party packages', planIds: ['basic', 'pro', 'elite'] },
      { id: id(), type: 'button', text: 'Book a party', url: 'https://www.captainglowsminigolf.com/', leadLabel: 'Birthday party', align: 'center' },
      { id: id(), type: 'text_us', text: 'Text us', message: "Hi Captain Glow! I'd like to ask about a birthday party." },
      { id: id(), type: 'paragraph', align: 'left', text: 'Weekend dates fill up fast, so grab yours early. Got questions? Just reply to this email and a real person will get back to you.' },
      { id: id(), type: 'divider' },
      { id: id(), type: 'paragraph', align: 'center', text: 'See you on the course!\nThe {{company_name}} crew' },
    ],
  },
  {
    name: 'Seasonal glow-up (with flyer)',
    description: 'A seasonal "come see what\'s new" email with your flyer at the top. Upload this season\'s flyer before sending.',
    subject: "New season, new glow: here's what's happening at {{company_name}}",
    preheader: 'Fresh games, family nights and party dates for the season. Come play!',
    blocks: [
      { id: id(), type: 'flyer', url: '', alt: "This season's events at Captain Glow Mini Golf", link: 'https://www.captainglowsminigolf.com/' },
      { id: id(), type: 'logo', align: 'center' },
      { id: id(), type: 'headline', text: 'Your seasonal glow check-up 🌟', size: 'md', align: 'left' },
      {
        id: id(), type: 'paragraph', align: 'left',
        text: "Hi {{first_name|there}},\n\nIt's a new season and we've been busy! Here's what's waiting for you:\n\n**Fresh arcade games** and new prizes at the counter\n**Family nights**: bring the whole crew for a round under the black lights\n**Party dates** opening up now for the season ahead",
      },
      { id: id(), type: 'services', title: 'Everything under one roof' },
      { id: id(), type: 'button', text: 'Plan your visit', url: 'https://www.captainglowsminigolf.com/', leadLabel: 'Seasonal visit', align: 'center' },
      { id: id(), type: 'text_us', text: 'Text us', message: "Hi Captain Glow! What's on this season?" },
      { id: id(), type: 'paragraph', align: 'center', text: 'See you soon!\nThe {{company_name}} crew' },
    ],
  },
  {
    name: 'Still here when you need us',
    description: 'A friendly "we miss you" reminder for customers you haven\'t seen in a while.',
    subject: "{{first_name|Hey}}, the course misses you!",
    preheader: 'Glow golf, arcade games and birthday parties, whenever you\'re ready.',
    blocks: [
      { id: id(), type: 'logo', align: 'center' },
      { id: id(), type: 'headline', text: "We're still here whenever you need a fun night out", size: 'md', align: 'left' },
      {
        id: id(), type: 'paragraph', align: 'left',
        text: "Hi {{first_name|there}},\n\nIt's been a little while, so we just wanted to say hi. Whether it's a rainy-day family outing, a date night, a team event or the next big birthday, {{company_name}} is ready when you are.\n\nNo pressure, no sales pitch. Just glow golf and good times.",
      },
      { id: id(), type: 'button', text: "I'm interested", url: 'https://www.captainglowsminigolf.com/', leadLabel: 'Come back', align: 'center' },
      { id: id(), type: 'text_us', text: 'Text us', message: 'Hi Captain Glow! I have a question.' },
      { id: id(), type: 'spacer', height: 12 },
      { id: id(), type: 'paragraph', align: 'center', text: 'Thanks for being part of the Captain Glow family.\nThe {{company_name}} crew' },
    ],
  },
];

/** Adds the starter templates the first time the app runs. */
export async function seedStarterTemplates() {
  const existing = await one<{ c: number }>('SELECT count(*)::int AS c FROM email_templates WHERE is_starter');
  if ((existing?.c ?? 0) > 0) return;
  for (const t of STARTER_TEMPLATES) {
    await query(
      'INSERT INTO email_templates (name, description, subject, preheader, blocks, is_starter) VALUES ($1, $2, $3, $4, $5, true)',
      [t.name, t.description, t.subject, t.preheader, JSON.stringify(t.blocks)],
    );
  }
  log.info('templates', 'Added the three starter templates');
}
