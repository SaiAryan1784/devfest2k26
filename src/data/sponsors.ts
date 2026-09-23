export type Partner = { name: string; src: string; url?: string };

/**
 * Real sponsor logo files (public/sponsor/), replacing the Simple Icons CDN
 * stand-in this used before those assets existed. `url` is omitted where a
 * confirmed sponsor homepage isn't known: an omitted url renders the logo
 * unlinked in LogoLoop rather than sending it to a guessed domain.
 */
export const PAST_PARTNERS: Partner[] = [
  { name: "Brevo", src: "/sponsor/brevo.png", url: "https://www.brevo.com" },
  { name: "Commudle", src: "/sponsor/commudle.png", url: "https://www.commudle.com" },
  { name: "DigitalOcean", src: "/sponsor/digitalocean.png", url: "https://www.digitalocean.com" },
  { name: "Exa Protocol", src: "/sponsor/exa-protocol.png" },
  { name: "FlutterFlow", src: "/sponsor/flutterflow.png", url: "https://flutterflow.io" },
  { name: "GitHub", src: "/sponsor/github.png", url: "https://github.com" },
  { name: "Google for Developers", src: "/sponsor/google-for-developers.png", url: "https://developers.google.com" },
  { name: "Hack2Skill", src: "/sponsor/hack2skill.png", url: "https://www.hack2skill.com" },
  { name: "Humalect", src: "/sponsor/humalect.png" },
  { name: "JetBrains", src: "/sponsor/jetbrains.png", url: "https://www.jetbrains.com" },
  { name: "Kaggle", src: "/sponsor/kaggle.png", url: "https://www.kaggle.com" },
  { name: "Neo4j", src: "/sponsor/neo4j.png", url: "https://neo4j.com" },
  { name: "Orkes", src: "/sponsor/orkes.png" },
  { name: "SHEROES", src: "/sponsor/sheroes.png" },
  { name: "Tata 1mg", src: "/sponsor/tata-1mg.png", url: "https://www.1mg.com" },
  { name: "Thoughtworks", src: "/sponsor/thoughtworks.png", url: "https://www.thoughtworks.com" },
];
