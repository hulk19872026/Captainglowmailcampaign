import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/ui';

const FAQ: { q: string; a: JSX.Element }[] = [
  {
    q: 'How do I send my first email campaign?',
    a: <>Go to <Link to="/campaigns/new">Campaigns → New campaign</Link>. Pick <em>Email</em>, choose a template (try "Birthday party packages"), tweak the wording, pick who gets it, choose when, and review. Turn on <strong>Test mode</strong> in step 7 the first time: it sends only to you, so you can check it on your phone before customers see it.</>,
  },
  {
    q: 'Why didn\'t everyone get my email straight away?',
    a: <>To protect your sender reputation (and keep you out of spam folders), the Marketing Center sends a little at a time: in small batches, up to your daily limit (set in <Link to="/settings">Settings</Link>). When it hits the limit it stops and carries on the next day from exactly where it left off. The <Link to="/schedule">Schedule</Link> page shows today's progress.</>,
  },
  {
    q: 'Could a customer get the same email twice?',
    a: <>No. The database itself refuses to record the same person twice for the same campaign pass, even if the app restarts mid-send. If something goes wrong while an email is "sending", it is put back in the queue, and anyone already marked as sent is never touched again.</>,
  },
  {
    q: 'How do I add or import customers?',
    a: <>On <Link to="/customers">Customers</Link>, click <em>Add customer</em> for one person, or <em>Import CSV</em> for a spreadsheet. The file needs a header row with columns like Email, First name, Last name and Phone. Importing the same person again updates them instead of creating a duplicate.</>,
  },
  {
    q: 'What happens when someone unsubscribes?',
    a: <>Every email has an unsubscribe link at the bottom. When someone uses it, they are marked unsubscribed and left out of every future campaign automatically. Emails that bounce permanently, or that someone marks as spam, go on the suppression list and are never emailed again. For texts, anyone who replies STOP is opted out; START opts them back in.</>,
  },
  {
    q: 'Who can I send text messages to?',
    a: <>Only customers who have agreed to receive texts (the "Agreed to texts" switch on their profile, or the SMS consent column in an import). This is required by law (TCPA). Every text includes an opt-out line like "Reply STOP to opt out." Use the filter "Has a phone, no texting consent" on Customers to see who you could ask.</>,
  },
  {
    q: 'What is a lead, and what should I do with it?',
    a: <>When a customer clicks an offer button in your email (like "Book a party"), they show up on the <Link to="/leads">Leads</Link> page. They're interested right now, so give them a call or send a quick reply. Move each lead along: New → Contacted → Quoted → Won or Lost, and add notes as you go.</>,
  },
  {
    q: 'Something says "not set up". What do I need to do?',
    a: <>Check the <Link to="/integrations">Integrations</Link> page. Email needs a Resend API key and a verified domain; texting needs your Twilio details. These are added once, as "variables" in Railway (where the app is hosted). The README file explains each step. Also make sure your mailing address is filled in under <Link to="/settings">Settings</Link>: the law requires it in every marketing email.</>,
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-6">
      <PageHeader title="Help" subtitle="Answers to the most common questions." />
      <div className="card divide-y divide-slate-100">
        {FAQ.map((f, i) => (
          <div key={i}>
            <button className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" onClick={() => setOpen(open === i ? null : i)}>
              <span className="font-semibold text-slate-800">{f.q}</span>
              <ChevronDown className={`h-5 w-5 flex-none text-slate-400 transition ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <div className="px-5 pb-5 text-sm leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-brand-600 [&_a]:underline">{f.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
