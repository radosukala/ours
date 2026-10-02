/**
 * The idea, in a picture (D-0020 §A): people and their connections in a
 * shared circle, with services around them. The feed is the first project;
 * the others are possibilities, and the picture's description says so.
 * Drawn in the page's own colours, so it follows the dark version too.
 */
import styles from "./door.module.css";

export const DIAGRAM_CAPTION =
  "The ambition: keep our connections and our say, even when the software, or the people running it, change.";

export function Diagram() {
  return (
    <figure className={styles.diagram} aria-labelledby="diagram-caption">
      <div className={styles.diagramTitle} aria-hidden="true">
        <span>The idea, in a picture</span>
        <span>People first. Apps follow.</span>
      </div>
      <svg className={styles.orbit} viewBox="0 0 440 387" role="img" aria-labelledby="orbit-title orbit-desc">
        <title id="orbit-title">A shared home for people, with services around it</title>
        <desc id="orbit-desc">
          People and their connections sit inside a shared circle, with services around them. The feed is the first
          project. Tools for work and a creator&apos;s home are possibilities, not projects.
        </desc>
        <circle cx="220" cy="193" r="151" className={styles.orbitRing} />
        <circle cx="220" cy="193" r="111" className={styles.orbitField} />
        <path
          d="M173 164L208 142L247 157L267 197L234 224L190 217Z M173 164L234 224 M208 142L190 217 M247 157L190 217 M173 164L267 197"
          className={styles.orbitLinks}
        />
        <g className={styles.orbitPeople}>
          <circle cx="173" cy="164" r="8" />
          <circle cx="208" cy="142" r="8" />
          <circle cx="247" cy="157" r="8" />
          <circle cx="267" cy="197" r="8" />
          <circle cx="234" cy="224" r="8" />
          <circle cx="190" cy="217" r="8" />
        </g>
        <rect x="149" y="174" width="142" height="41" rx="20" className={styles.orbitPill} />
        <text x="220" y="201" textAnchor="middle" className={styles.orbitName}>
          our.one
        </text>
        <text x="220" y="269" textAnchor="middle" className={styles.orbitMotto}>
          OUR PEOPLE. OUR SAY.
        </text>
        <g transform="translate(143 21) rotate(-5 78 26)">
          <rect width="154" height="52" rx="4" className={styles.orbitFirst} />
          <text x="17" y="24" className={styles.orbitFirstKicker}>
            FIRST PROJECT
          </text>
          <text x="17" y="41" className={styles.orbitFirstName}>
            A friends feed
          </text>
          <text x="129" y="32" className={styles.orbitFirstArrow}>
            ↗
          </text>
        </g>
        <g transform="translate(3 178) rotate(-7 64 24)">
          <rect width="122" height="50" rx="4" className={styles.orbitCard} />
          <text x="13" y="20" className={styles.orbitKicker}>
            IMAGINE
          </text>
          <text x="13" y="37" className={styles.orbitCardName}>
            Tools for work
          </text>
        </g>
        <g transform="translate(302 164) rotate(7 63 24)">
          <rect width="131" height="50" rx="4" className={styles.orbitCard} />
          <text x="13" y="20" className={styles.orbitKicker}>
            IMAGINE
          </text>
          <text x="13" y="37" className={styles.orbitCardName}>
            A creator&apos;s home
          </text>
        </g>
        <g transform="translate(159 322) rotate(3 62 22)">
          <rect width="124" height="44" rx="4" className={styles.orbitCard} />
          <text x="14" y="28" className={styles.orbitElse}>
            What else?
          </text>
          <text x="100" y="28" className={styles.orbitPlus}>
            +
          </text>
        </g>
      </svg>
      <figcaption id="diagram-caption" className={styles.diagramCaption}>
        {DIAGRAM_CAPTION}
      </figcaption>
    </figure>
  );
}
