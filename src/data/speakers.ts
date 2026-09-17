export type Speaker = {
  name: string;
  role: string;
  company?: string;
  // TODO: replace null with a real photo path in public/brand/speakers/ when supplied.
  photo: string | null;
};

// From the DevFest Noida 2025 Commudle page. Photos pending.
export const SPEAKERS_2025: Speaker[] = [
  { name: "Saurabh Rajpal", role: "Staff Web Ecosystem Consultant", company: "Google", photo: null },
  { name: "Joy Banerjee", role: "VP, Design", company: "Blinkit", photo: null },
  { name: "Shivay Lamba", role: "GSoC Mentor", company: "TensorFlow", photo: null },
  { name: "Vipul Gupta", role: "Senior Product Engineer", company: "GitHub Star", photo: null },
  { name: "Utkarsh Gupta", role: "Principal Engineer", photo: null },
  { name: "Tarushi Sharma", role: "Product Manager", company: "American Express", photo: null },
  { name: "Manjunath Janardhan", role: "Principal AI Engineer", photo: null },
  { name: "Aprajita Verma", role: "Frontend Architect", photo: null },
];
