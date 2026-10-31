// Seed announcements — campus notices published by staff.
// Stored to data/announcements.json on first run; afterwards the JSON file
// wins (so POST /api/announcements creations persist across restarts).
// `activityId` optionally links a notice to an activity on the feed.
module.exports = [
  {
    id: "ann-gates-early",
    title: "Gates open 30 minutes early on Saturday",
    body: "To beat the morning rush, all venue gates open half an hour before the first event. Keep your QR ticket ready on your phone — no printouts needed.",
    tag: "Logistics",
    activityId: "sports-day-2026",
    author: "Meera Krishnan",
    authorRole: "Activity Administrator",
    pinned: true,
    createdAt: "2026-10-28T08:00:00.000Z",
  },
  {
    id: "ann-expo-deadline",
    title: "Science Expo abstracts: deadline extended by 2 days",
    body: "Mentors need a little more time, so abstract submissions stay open two extra days. Upload your project abstract and safety form from the activity page.",
    tag: "Deadline",
    activityId: "science-expo",
    author: "Kiran Patel",
    authorRole: "Teacher",
    pinned: true,
    createdAt: "2026-10-27T10:30:00.000Z",
  },
  {
    id: "ann-fest-auditions",
    title: "Rang auditions: final slots released",
    body: "The last batch of audition slots for music, dance and drama is now open. Teams of 3–8 can register — audition clips are due before the 10th.",
    tag: "Auditions",
    activityId: "culture-fest",
    author: "Meera Krishnan",
    authorRole: "Activity Administrator",
    pinned: false,
    createdAt: "2026-10-25T15:00:00.000Z",
  },
  {
    id: "ann-bootcamp-batch",
    title: "Robotics bootcamp adds a second batch",
    body: "The first batch filled out in a day, so the Tinker Lab has opened a second batch with the same Arduino kits and take-home bot. Beginners welcome.",
    tag: "New batch",
    activityId: "robotics-bootcamp",
    author: "S. Rajan",
    authorRole: "Principal",
    pinned: false,
    createdAt: "2026-10-24T09:00:00.000Z",
  },
];
