/* Review Desk — authored simulation content.
 * Source passages are immutable exercise material (spec §8). Findings are authored, not generated.
 * Malaria.docx is deliberately inaccurate; its corrected mechanism and treatment are always shown in findings. */
(function () {
  "use strict";

  const DOCUMENTS = {
    photosynthesis: {
      id: "photosynthesis",
      file: "Photosynthesis.docx",
      title: "Photosynthesis",
      modified: "12/03/2024 09:14",
      text: "Photosynthesis is how plants convert sunlight into energy. In temperate climates, deciduous trees such as oak and maple do this using chlorophyll during the growing season.",
      accuracy: { status: "Accurate", tone: "neutral", detail: "The explanation agrees with the reference material." },
      representation: { status: "Narrow", tone: "warning", detail: "Only temperate-climate plants are included." },
      needsFix: true,
      fixRule: "regional-example"
    },
    heart: {
      id: "heart",
      file: "Human heart.docx",
      title: "Human heart",
      modified: "11/03/2024 16:21",
      text: "The heart has three chambers: two atria and one ventricle, which pump blood around the body.",
      accuracy: { status: "Inaccurate", tone: "error", detail: "The human heart has four chambers: two atria and two ventricles." },
      representation: { status: "Not applicable", tone: "neutral", detail: "This anatomical statement does not need contrasting regional examples." },
      needsFix: true,
      fixRule: "heart-chambers"
    },
    debate: {
      id: "debate",
      file: "Classroom debate.docx",
      title: "Classroom debate",
      modified: "10/03/2024 14:37",
      text: "A balanced classroom debate exercise can include examples from students' own local context, such as market trading practices in Ekiti State, alongside national and international case studies.",
      accuracy: { status: "Accurate", tone: "neutral", detail: "The description agrees with the reference material." },
      representation: { status: "Representative", tone: "neutral", detail: "Local, national and international examples are included." },
      needsFix: false
    },
    malaria: {
      id: "malaria",
      file: "Malaria.docx",
      title: "Malaria",
      modified: "13/03/2024 10:02",
      text: "Malaria is caused by bacteria and is treated with antibiotics; most research and case studies on treatment come from clinics in Europe and North America.",
      accuracy: { status: "Inaccurate", tone: "error", detail: "Malaria is caused by a parasite spread by mosquitoes and treated with antimalarial medicines." },
      representation: { status: "Narrow", tone: "warning", detail: "The framing omits the relevance of Sub-Saharan Africa, including Nigeria." },
      needsFix: true,
      fixRule: "final-malaria",
      final: true
    }
  };

  /* Verdict labels as specified by the source storyboard.
   * KNOWN ISSUE (spec §10): the heart excerpt's representation finding is "Not applicable", which none of
   * these labels expresses. A proposed revision awaits author sign-off — see VERDICT_LABELS_PROPOSED.
   * Until then verdicts are recorded verbatim and never scored against an expected mapping. */
  const VERDICT_LABELS_STORYBOARD = [
    "Accurate & Representative",
    "Accurate but Narrow",
    "Inaccurate but Representative",
    "Inaccurate and Narrow"
  ];
  const VERDICT_LABELS_PROPOSED = [
    "Accurate; no representation issue",
    "Accurate but narrow",
    "Inaccurate; no representation issue",
    "Inaccurate and narrow"
  ];

  const CASE = {
    id: "audit-ai-answer",
    documents: DOCUMENTS,
    reviewDocs: ["photosynthesis", "heart", "debate"],
    fixDocs: ["photosynthesis", "heart"],
    finalDoc: "malaria",
    verdictLabels: VERDICT_LABELS_STORYBOARD,
    verdictLabelSet: "storyboard",
    folder: ["photosynthesis", "heart", "debate", "malaria"],
    persist: true
  };

  /* Separate, non-assessed walkthrough dataset. Never written to the learner record. */
  const DEMO_CASE = {
    id: "walkthrough-demo",
    documents: {
      sample: {
        id: "sample",
        file: "Sample.docx",
        title: "Sample",
        modified: "14/10/2026 09:30",
        text: "This draft combines short classroom notes and examples. Review its factual claims and the range of contexts before sharing it.",
        accuracy: { status: "Checked", tone: "neutral", detail: "", heading: "Accuracy checked" },
        representation: { status: "Checked", tone: "neutral", detail: "", heading: "Representation checked" },
        needsFix: true,
        fixRule: "demo"
      }
    },
    reviewDocs: ["sample"],
    fixDocs: ["sample"],
    finalDoc: null,
    verdictLabels: VERDICT_LABELS_STORYBOARD,
    verdictLabelSet: "storyboard",
    folder: ["sample"],
    persist: false
  };

  /* Assessment strands preserved from the storyboard. No numerical score is computed or displayed:
   * deductions and performance bands are undefined in the source (spec §10). */
  const ASSESSMENT = {
    weights: { accuracy: 0.35, representation: 0.35, fixQuality: 0.30 },
    speedScoring: false,
    rubricVersion: "prototype-keyword-rubric-0.1 (not approved for assessed release)"
  };

  /* ---------- Bounded authored rubric (prototype) ----------
   * Deliberately narrow keyword rules. They distinguish a named example from generic advice and a stated
   * correction from a negated or still-incorrect sentence. They are not a semantic evaluator. */
  const NEGATORS = /(?:\bnot|n't|\bno|\bnever|\brather than|\binstead of|\bnor|\bwrong(?:ly)?|\bincorrect(?:ly)?|\bisn't|\bnot by|\bmyth|\bnot caused by|\bnot treated with)\s*(?:\w+\s+){0,3}$/;

  function norm(text) {
    return " " + String(text || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ") + " ";
  }
  /* true when pattern occurs at least once without a negating phrase just before it */
  function assertsPositively(t, re) {
    const g = new RegExp(re.source, "g");
    let m;
    while ((m = g.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 32), m.index);
      if (!NEGATORS.test(before)) return true;
    }
    return false;
  }

  const REGIONAL_PLANTS = /\b(cassava|maize|corn|oil palms?|palm trees?|yams?|cocoa|cacao|sorghum|millet|rice|plantains?|bananas?|mangoe?s?|baobabs?|groundnuts?|peanuts?|cowpeas?|kola|shea|rubber trees?|sugar ?cane|coffee|coconuts?|iroko|mahogany|okra|cashews?|pineapples?|teak|acacias?|mangroves?|cotton)\b/;

  function checkPractice(rule, text) {
    const t = norm(text);
    if (rule === "demo") return { accepted: t.trim().length > 0, feedback: "" };
    if (rule === "regional-example") {
      const ok = assertsPositively(t, REGIONAL_PLANTS);
      return { accepted: ok, feedback: ok ? "" : "Name a specific example." };
    }
    if (rule === "heart-chambers") {
      const four = assertsPositively(t, /\b(four|4)\b(?:[\w\s-]{0,12})chamber|chambers?\b[\w\s:,-]{0,12}\b(four|4)\b/);
      const twoV = assertsPositively(t, /\b(two|2) ventricles\b|\b(left and right|right and left) ventricles\b/);
      const three = assertsPositively(t, /\b(three|3)(?:[\w\s-]{0,6})chambers?\b/);
      const oneV = assertsPositively(t, /\b(one|1|a single|single) ventricle\b/);
      const ok = four && twoV && !three && !oneV;
      return { accepted: ok, feedback: ok ? "" : "State the corrected fact." };
    }
    return { accepted: false, feedback: "" };
  }

  /* Final fix: assessed after the one-time submission. Dimensions are reported separately. */
  function assessFinal(text) {
    const t = norm(text);
    const cause = assertsPositively(t, /\b(parasites?|parasitic|plasmodium|protozoa\w*)\b/) && !assertsPositively(t, /\b(caused by|is a) bacteri\w*/);
    const treatment = assertsPositively(t, /\b(antimalarials?|anti-malarials?|artemisinin\w*|\bacts?\b|artemether\w*|chloroquine|quinine|lumefantrine)\b/) && !assertsPositively(t, /\btreated (?:\w+ ){0,2}antibiotics?\b/);
    const regional = assertsPositively(t, /\b(africa|african|sub-saharan|nigeria|nigerian|ghana|kenya|uganda|tanzania|malawi|mozambique|cameroon|lagos|ibadan|abuja|ekiti|kano|west africa)\b/);
    const factual = cause && treatment;
    let note;
    if (factual && regional) note = "The factual correction and regional representation are both recorded.";
    else if (factual) note = "The factual correction is recorded. Regional representation was not addressed.";
    else if (regional && (cause || treatment)) note = cause
      ? "Regional representation is recorded. The cause is corrected; the treatment was not addressed."
      : "Regional representation is recorded. The treatment is corrected; the cause was not addressed.";
    else if (regional) note = "Regional representation is recorded. The factual error was not corrected.";
    else if (cause || treatment) note = (cause ? "The cause is corrected; the treatment was not addressed." : "The treatment is corrected; the cause was not addressed.") + " Regional representation was not addressed.";
    else note = "Neither the factual error nor regional representation was addressed.";
    return { cause, treatment, factual, regional, note };
  }

  window.ReviewDeskData = { CASE, DEMO_CASE, ASSESSMENT, VERDICT_LABELS_PROPOSED, checkPractice, assessFinal };
})();
