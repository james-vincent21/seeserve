import type { SourceType } from '../repositories/rag.repository.js';

/** Fictional house documents for "Dhaka Table House", used as the retrieval corpus. */
export const knowledgeDocs: Array<{ sourceType: SourceType; title: string; body: string }> = [
  {
    sourceType: 'policy',
    title: 'Reservation and queue policy',
    body: `# Reservations
Bookings are accepted from 12:00 to 22:00 Dhaka time, up to 30 days ahead, for parties of up to the largest table at the branch (6 guests). Larger groups must call the branch.

Every booking gets a ticket number starting with R-. Guests can check or cancel it on the website with the same email used to book.

A reserved table is held from 15 minutes before the booking. If the party has not arrived 20 minutes after the booking time, staff may mark it as a no-show and release the table.

# Walk-in queue
Walk-in guests get a queue ticket starting with Q-. The wait estimate uses the measured average table turn time for the branch over the last 30 days, falling back to 45 minutes plus 8 minutes per extra guest when there is not enough data.

Staff call queue tickets in order, except that a smaller party may be seated first when only a small table is free.`,
  },
  {
    sourceType: 'policy',
    title: 'Iftar service policy',
    body: `# Iftar during Ramadan
During Ramadan, guests arrive 30 to 45 minutes before Maghrib and wait for the call to prayer before eating. Staff serve dates, water and juice at the table before Iftar.

The floor system switches to Iftar mode: unattended-table alerts wait ten times longer, so staff are not flooded with false alarms while guests are waiting on purpose. Hand-raise requests are still shown immediately.

The Iftar platter is prepared in advance and must be on every seated table 10 minutes before Maghrib.`,
  },
  {
    sourceType: 'policy',
    title: 'Guest privacy notice',
    body: `# Privacy
The floor cameras are used only to count people and chairs at each table. No video, photos or face data are stored. Frames are analysed in memory and discarded.

For bookings and queue tickets we keep the guest's name, email and party size so we can send the ticket and confirm changes. Emails are not used for marketing unless the guest opts in. Guests can ask the branch to delete their booking data at any time.`,
  },
  {
    sourceType: 'supplier_note',
    title: 'Supplier notes',
    body: `# Meat
Mutton for kacchi comes from Karwan Bazar Meats, delivered daily at 08:00. Order cut-off is 20:00 the previous day. Price rose about 8 percent in October.

# Fish
Hilsa (ilish) supply is seasonal and expensive outside the main season; Shorshe Ilish margin falls sharply from November to February.

# Seafood
Imported lobster comes frozen from a Chattogram importer with a minimum order of 10 kg. Lobster Thermidor sells rarely and has almost no margin; consider removing it or repricing.

# Dairy
Mishti doi is supplied from Bogura twice a week (Sunday and Wednesday).`,
  },
  {
    sourceType: 'faq',
    title: 'Guest FAQ',
    body: `# Opening hours
All branches are open daily from 12:00 to 23:00. Kitchen last orders are at 22:30.

# Parking
Gulshan has valet parking. Dhanmondi has limited street parking. Uttara has a basement car park.

# Dietary needs
Vegetarian dishes are tagged on the menu. All meat is halal. Ask staff about nuts: the rezala and firni contain cashew and pistachio.

# Payment
We accept cash, cards and mobile payments.

# Birthdays
Tell us when booking and we will bring a complimentary dessert.`,
  },
];
