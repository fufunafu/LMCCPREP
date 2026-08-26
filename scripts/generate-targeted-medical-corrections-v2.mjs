#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const snapshotPath = resolve(outputDirectory, "question-review-snapshot.json");
const batchPath = resolve(outputDirectory, "targeted-medical-corrections-v2.json");

const corrections = [
  {
    qid: 1507,
    reason: "Remove duplicated option-number prefixes and keep prompt factual disclosure of the known missed result.",
    sources: [
      "https://www.cpso.on.ca/physicians/policies-guidance/policies/disclosure-of-harm/advice-to-the-profession-disclosure-of-harm",
    ],
    options: [
      "Defer discussion of the missed report until a diagnosis of cancer is confirmed pathologically",
      "Attribute the delay to a clerical system failure without explicitly mentioning the missed report",
      "Disclose the known facts about the missed report and delayed follow-up to the patient now",
      "Complete a root cause analysis before speaking to the patient",
      "Transfer the patient to another provider before discussing the error",
    ],
    answerIndex: 2,
    explanation: [
      "Disclose the known facts about the missed report and delayed follow-up to the patient now.",
      "The abnormal report reached the patient's care process, was missed, and delayed the recommended biopsy. The physician should promptly explain what is known, acknowledge the delay, and describe the urgent diagnostic and referral plan.",
      "A quality review is also appropriate, but it must not postpone disclosure. Disclosure should not wait for pathology because the care-process failure and resulting delay are already known.",
    ],
    keyPoints: "Disclose known harmful or potentially harmful care incidents promptly. Explain the facts that are known, the possible consequences, and the plan to reduce harm. System review and disclosure can proceed in parallel.",
    optionRationales: [
      "Incorrect. The missed follow-up is already known and disclosure should not depend on the eventual pathology.",
      "Incorrect. Vague attribution omits the material fact that the abnormal report was missed.",
      "Correct. Prompt factual disclosure and a clear mitigation plan respect the patient's right to know.",
      "Incorrect. Root cause analysis is useful but should not delay the initial disclosure.",
      "Incorrect. A transfer is not required before candidly addressing the incident and arranging care.",
    ],
  },
  {
    qid: 1510,
    reason: "Specify Ontario and place the sexual relationship within one year after psychiatric care ended so the reporting duty is determinate.",
    sources: [
      "https://www.cpso.on.ca/physicians/policies-guidance/policies/reporting-requirements/guide-to-legal-reporting-requirements",
      "https://www.cpso.on.ca/physicians/policies-guidance/policies/boundary-violations",
    ],
    stem: "In Ontario, a 32-year-old man presents as a new patient. He says his psychiatrist ended their treatment relationship 8 months ago. Two months later, he and the psychiatrist began a consensual sexual relationship that ended last week. He asks you to keep this information confidential because he does not believe he was harmed. What is the most appropriate next step?",
    options: [
      "Respect his request and document the discussion without reporting",
      "Ask him to report the psychiatrist himself",
      "Explain the mandatory reporting duty and report the psychiatrist to the regulatory college",
      "Contact the psychiatrist to verify the account before taking action",
      "Tell him to contact police before any professional report is made",
    ],
    answerIndex: 2,
    explanation: [
      "Explain the mandatory reporting duty and report the psychiatrist to the regulatory college.",
      "In Ontario, sexual relations during the first year after a person ceased to be a physician's patient are treated as sexual abuse under the professional legislation. A physician with reasonable grounds to believe another regulated professional sexually abused a patient must report to the appropriate college and should make best efforts to inform the patient first.",
      "The reporting physician should not conduct a private investigation or shift the reporting obligation to the patient. The report should contain only the information required by law, with patient identity handled according to the applicable reporting rules.",
    ],
    keyPoints: "Jurisdiction and timing determine legal reporting questions. In Ontario, sexual relations within one year after the physician-patient relationship ends are treated as sexual abuse. Reasonable grounds trigger reporting; proof from a private investigation is not required.",
    optionRationales: [
      "Incorrect. A statutory reporting duty overrides the request not to report the professional conduct.",
      "Incorrect. Encouraging a patient complaint does not discharge the physician's independent duty.",
      "Correct. The facts fall within Ontario's one-year rule and require a report to the college.",
      "Incorrect. The reporting physician should not contact the subject physician to investigate the allegation.",
      "Incorrect. A police report is not a prerequisite to the mandatory professional report.",
    ],
  },
  {
    qid: 1517,
    reason: "Replace confirmatory pressure measurement with immediate surgical consultation and fasciotomy for a reliable patient with a clinically diagnostic presentation.",
    sources: [
      "https://www.aaos.org/acscpg",
      "https://www.aaos.org/quality/quality-programs/acute-compartment-syndrome/",
    ],
    options: [
      "Elevate the arm above the level of the heart",
      "Request an arterial Doppler ultrasound",
      "Obtain emergent surgical consultation for immediate fasciotomy",
      "Apply a compressive tensor bandage and ice",
      "Perform a regional nerve block and reassess later",
    ],
    answerIndex: 2,
    explanation: [
      "Obtain emergent surgical consultation for immediate fasciotomy.",
      "Pain out of proportion, pain with passive finger extension, and a tense swollen forearm in a reliable patient make acute compartment syndrome a clinical diagnosis. Preserved pulses do not exclude it. Definitive decompression must not be delayed for confirmatory testing.",
      "Intracompartmental pressure monitoring is useful when the examination is unreliable or the diagnosis remains uncertain. It is not a reason to postpone treatment when the findings are classic.",
    ],
    keyPoints: "Acute compartment syndrome is primarily a clinical diagnosis. Pain with passive stretch and a tense compartment are early high-value findings, while pulses may remain present. Urgent complete fasciotomy is definitive treatment.",
    optionRationales: [
      "Incorrect. Elevation above heart level can reduce perfusion pressure in an ischemic compartment.",
      "Incorrect. Arterial flow may remain intact and Doppler testing does not address compartment pressure.",
      "Correct. The classic clinical syndrome requires immediate surgical decompression.",
      "Incorrect. External compression can worsen intracompartmental pressure.",
      "Incorrect. A regional block may obscure progression and delays definitive care.",
    ],
  },
  {
    qid: 1526,
    reason: "Make observation the primary management for incidental asymptomatic prolapse while retaining risk-factor counselling.",
    sources: ["https://www.nice.org.uk/guidance/ng123/chapter/recommendations"],
    options: [
      "Refer for anterior colporrhaphy",
      "Fit the patient with a ring pessary",
      "Offer observation with advice on weight loss and constipation management",
      "Prescribe topical vaginal estrogen",
      "Order urodynamic testing",
    ],
    answerIndex: 2,
    explanation: [
      "Offer observation with advice on weight loss and constipation management.",
      "This is an incidental, asymptomatic stage 2 anterior prolapse. No treatment is an acceptable management option, and intervention should be guided by symptoms and patient preference rather than examination stage alone.",
      "Her BMI and constipation are modifiable factors that increase intra-abdominal pressure, so lifestyle counselling is reasonable. Pessary use, pelvic-floor therapy, and surgery are mainly considered when prolapse is symptomatic or bothersome.",
    ],
    keyPoints: "Incidental asymptomatic pelvic organ prolapse can be observed. Discuss options and patient preferences. Weight loss when BMI exceeds 30 and prevention or treatment of constipation are reasonable lifestyle measures.",
    optionRationales: [
      "Incorrect. Surgery is not indicated for an incidental prolapse without bothersome symptoms.",
      "Incorrect. A pessary is generally offered for symptomatic prolapse or when the patient wants treatment.",
      "Correct. Observation plus risk-factor counselling matches an asymptomatic incidental finding.",
      "Incorrect. Vaginal estrogen targets menopausal genitourinary symptoms, which are not described.",
      "Incorrect. Urodynamic testing is not required for an asymptomatic incidental prolapse without urinary complaints.",
    ],
  },
  {
    qid: 1527,
    reason: "Name the specific etonogestrel-ethinyl estradiol ring because allowable removal time is product specific.",
    sources: ["https://www.organon.com/canada-en/wp-content/uploads/sites/5/2021/05/NUVARING-PM_E.pdf"],
    stem: "A 27-year-old woman calls about her NuvaRing, an etonogestrel-ethinyl estradiol combined hormonal contraceptive ring. She is in week 2 and removed it 2 hours ago for intercourse because her partner found it uncomfortable. She has used the ring correctly before this event and has it with her now. What is the most appropriate next step?",
    options: [
      "Discard the current ring and insert a new ring immediately",
      "Rinse the ring with cool or lukewarm water and reinsert it now; no backup contraception is needed",
      "Reinsert the ring now and use condoms for the next 7 days",
      "Use levonorgestrel emergency contraception and reinsert the ring",
      "Wait for a withdrawal bleed and start a new ring cycle in 7 days",
    ],
    answerIndex: 1,
    explanation: [
      "Rinse the ring with cool or lukewarm water and reinsert it now; no backup contraception is needed.",
      "The NuvaRing product monograph states that contraceptive efficacy is not reduced when the ring has been outside the vagina for less than 3 hours. It should be rinsed with cool to lukewarm water and reinserted as soon as possible.",
      "Backup contraception is required when the ring has been out for more than 3 continuous hours, with the response depending on the week of use. That threshold has not been crossed here.",
    ],
    keyPoints: "Management of a removed vaginal contraceptive ring is product specific. For NuvaRing, less than 3 hours outside the vagina does not reduce efficacy. Rinse and reinsert promptly without backup contraception.",
    optionRationales: [
      "Incorrect. The current ring can be reinserted because it has been out for less than 3 hours.",
      "Correct. This follows the product-specific instructions for a brief removal.",
      "Incorrect. Seven days of backup is not required after only 2 hours outside the vagina.",
      "Incorrect. Emergency contraception is not indicated after this correctly managed brief removal.",
      "Incorrect. Extending the ring-free interval would reduce contraceptive protection.",
    ],
  },
  {
    qid: 1531,
    reason: "Retain lithium withholding but add serial toxicity monitoring and clarify that severe neurologic features are absent.",
    sources: [
      "https://www.extrip-workgroup.org/lithium",
      "https://www.nice.org.uk/guidance/cg185/chapter/recommendations",
    ],
    stem: "A 34-year-old woman with bipolar I disorder takes lithium carbonate 900 mg daily. After 3 days of vomiting and watery diarrhea, she is dehydrated with a fine tremor. She is alert and oriented without confusion or seizures, and her ECG shows sinus tachycardia without a dysrhythmia. Creatinine is 145 micromol/L, potassium 3.2 mmol/L, and lithium 1.5 mmol/L. Intravenous isotonic fluid resuscitation is started. What is the most appropriate next step regarding lithium?",
    options: [
      "Continue the current dose and recheck the lithium level in 12 hours",
      "Reduce the lithium dose by half until the gastrointestinal illness resolves",
      "Withhold lithium and obtain serial clinical, lithium, renal, electrolyte, and ECG assessments during rehydration",
      "Add a thiazide diuretic to enhance lithium excretion",
      "Switch immediately to divalproex to prevent relapse",
    ],
    answerIndex: 2,
    explanation: [
      "Withhold lithium and obtain serial clinical, lithium, renal, electrolyte, and ECG assessments during rehydration.",
      "Volume depletion and acute kidney injury reduce lithium clearance and increase proximal tubular lithium reabsorption. Continuing any lithium dose during active toxicity can worsen accumulation, so the drug should be withheld while isotonic fluids and electrolyte correction restore renal clearance.",
      "Serial lithium concentrations and clinical monitoring are needed because the serum value may change and symptoms guide escalation. Severe neurologic toxicity, life-threatening dysrhythmia, marked renal impairment, or a high or slowly clearing level should prompt urgent toxicology or nephrology assessment for extracorporeal treatment.",
    ],
    keyPoints: "Stop lithium during suspected toxicity and correct volume depletion. Follow symptoms, serial lithium concentrations, renal function, electrolytes, and ECG findings. Escalate severe or poorly clearing toxicity for extracorporeal-treatment assessment.",
    optionRationales: [
      "Incorrect. Continued dosing can worsen accumulation while kidney function is impaired.",
      "Incorrect. Dose reduction is insufficient during active toxicity and dehydration.",
      "Correct. Withholding lithium, rehydration, and serial monitoring address the current toxicity safely.",
      "Incorrect. Thiazides reduce lithium clearance and can worsen toxicity.",
      "Incorrect. Immediate substitution is not the acute priority and may add medication risk during dehydration.",
    ],
  },
  {
    qid: 1540,
    reason: "Require confirmation of a single low testosterone value before completing the secondary-cause workup.",
    sources: ["https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy"],
    options: [
      "Karyotype analysis",
      "MRI of the pituitary gland",
      "Repeat a fasting morning total testosterone measurement on a separate day",
      "Serum prolactin measurement",
      "Scrotal ultrasonography",
    ],
    answerIndex: 2,
    explanation: [
      "Repeat a fasting morning total testosterone measurement on a separate day.",
      "Symptoms and one low morning testosterone result suggest hypogonadism, but diagnosis requires consistently low concentrations. The result should first be confirmed with a repeat fasting morning total testosterone using an accurate assay.",
      "If low testosterone is confirmed, LH and FSH help classify primary versus secondary hypogonadism, and targeted tests such as prolactin and iron studies can assess a central cause. Pituitary imaging is reserved for appropriate biochemical or neurologic indications.",
    ],
    keyPoints: "Diagnose male hypogonadism only when compatible symptoms accompany unequivocally and consistently low testosterone. Confirm a low value with a repeat fasting morning measurement before pursuing cause-specific testing or treatment.",
    optionRationales: [
      "Incorrect. A karyotype is used for selected primary gonadal disorders after the diagnosis is established.",
      "Incorrect. Pituitary imaging is premature before biochemical confirmation and targeted central evaluation.",
      "Correct. A second fasting morning value is required to confirm consistently low testosterone.",
      "Incorrect as the immediate next step. Prolactin is appropriate after low testosterone is confirmed and secondary hypogonadism remains likely.",
      "Incorrect. The examination does not suggest a focal testicular lesion requiring ultrasound.",
    ],
  },
  {
    qid: 1542,
    reason: "Replace an overbroad equivalence claim with the supported conclusion that clinician-delivered telephone CBT is an effective access option.",
    sources: ["https://www.nice.org.uk/guidance/ng222/chapter/recommendations"],
    options: [
      "Telephone-delivered CBT consistently has higher attrition than in-person therapy",
      "A therapeutic alliance cannot be established without visual interaction",
      "Clinician-supported telephone CBT is an evidence-based option when it matches the patient's needs and access constraints",
      "Telephone-delivered CBT can only be used as an adjunct to medication",
      "Self-guided internet CBT is always superior to clinician-delivered telephone CBT",
    ],
    answerIndex: 2,
    explanation: [
      "Clinician-supported telephone CBT is an evidence-based option when it matches the patient's needs and access constraints.",
      "Psychological treatment should be matched to clinical need and patient preference. Structured CBT-based interventions can be delivered with practitioner support by telephone, which can reduce geographic and mobility barriers while preserving regular review of progress.",
      "The evidence does not justify absolute claims that every telephone program is equivalent or superior to every in-person or internet program. Treatment intensity, therapist competence, patient preference, risk, and symptom severity still matter.",
    ],
    keyPoints: "Telephone delivery can be a valid route for structured, clinician-supported CBT. Select the modality through shared decision-making and match intensity to severity, risk, access, and patient preference. Avoid universal equivalence or superiority claims.",
    optionRationales: [
      "Incorrect. Attrition depends on the program and population, so a universal higher-rate claim is unsupported.",
      "Incorrect. A therapeutic alliance can be developed through telephone care.",
      "Correct. Telephone delivery is a legitimate evidence-based access option when clinically appropriate.",
      "Incorrect. CBT-based treatment can be used without medication in suitable patients.",
      "Incorrect. No delivery format is always superior across patients and programs.",
    ],
  },
  {
    qid: 1578,
    reason: "Combine immediate removal from clinical duties with prompt notification of the accountable residency supervisor.",
    sources: [
      "https://www.cpso.on.ca/Physicians/Policies-Guidance/Policies/Reporting-Requirements",
      "https://www.cpso.on.ca/Physicians/Policies-Guidance/Policies/Reporting-Requirements/Advice-to-the-Profession-Reporting-Requirements",
    ],
    options: [
      "Send the resident home and cover the patient list without notifying anyone",
      "Immediately remove the resident from clinical duties and notify the residency program director or site supervisor",
      "Report directly to the provincial college as the only immediate action",
      "Ask the charge nurse to monitor the resident while the resident continues working",
      "Suggest the physician health program but allow the resident to finish the shift",
    ],
    answerIndex: 1,
    explanation: [
      "Immediately remove the resident from clinical duties and notify the residency program director or site supervisor.",
      "Alcohol odour, tremor, declining performance, and refusal to step down create an immediate patient-safety risk. The resident should not continue clinical work. The senior resident should activate the local chain of accountability so a person with authority can secure patient coverage, assess the trainee, and arrange a safe disposition.",
      "Further reporting and physician-health support may also be required, but they do not replace immediate risk control. Sending the resident away without informing an accountable supervisor fails to address follow-up, documentation, and ongoing safety.",
    ],
    keyPoints: "Act immediately when a colleague appears to be practising under the influence. Stop the unsafe clinical activity and notify the person to whom the professional is accountable. Add health support and regulatory steps according to jurisdiction and institutional policy.",
    optionRationales: [
      "Incorrect. Removing the resident without notifying an accountable supervisor leaves the safety event unaddressed.",
      "Correct. It controls the immediate risk and activates the appropriate supervisory process.",
      "Incorrect as the only first action. A report does not itself stop the resident from treating patients in the current shift.",
      "Incorrect. Observation is unsafe when there are direct signs of impairment.",
      "Incorrect. Health-program referral is supportive but does not permit continued patient care while impaired.",
    ],
  },
  {
    qid: 1594,
    reason: "Replace routine ova-and-parasite microscopy with a sensitive Giardia-specific stool test.",
    sources: [
      "https://www.cdc.gov/giardia/hcp/diagnosis-testing/index.html",
      "https://www.cdc.gov/dpdx/diagnosticprocedures/stool/antigendetection.html",
    ],
    options: [
      "Stool culture for bacterial enteric pathogens",
      "Giardia stool antigen assay or stool nucleic acid amplification test",
      "Tissue transglutaminase IgA",
      "Polymerase chain reaction for Clostridioides difficile",
      "Colonoscopy with biopsy",
    ],
    answerIndex: 1,
    explanation: [
      "Order a Giardia stool antigen assay or stool nucleic acid amplification test.",
      "Subacute greasy, foul-smelling diarrhea, bloating, weight loss, and untreated stream-water exposure strongly suggest giardiasis. A Giardia-specific stool assay confirms the suspected pathogen with greater sensitivity than routine light microscopy.",
      "Direct fluorescent antibody testing is a reference method, and enzyme immunoassays, rapid antigen assays, and molecular tests are also available. Several specimens may be requested when the chosen method or initial result requires it.",
    ],
    keyPoints: "Giardiasis causes nonbloody malabsorptive diarrhea, bloating, flatulence, and weight loss after contaminated-water exposure. Confirm with a Giardia-specific stool assay such as antigen detection, direct fluorescent antibody, or nucleic acid testing.",
    optionRationales: [
      "Incorrect. The syndrome is more typical of Giardia than an invasive bacterial enteritis.",
      "Correct. A Giardia-specific stool assay directly tests the leading diagnosis.",
      "Incorrect. Celiac testing does not address the strong infectious exposure and timing.",
      "Incorrect. There is no antibiotic exposure or typical C. difficile syndrome.",
      "Incorrect. Endoscopy is not the initial test for a classic treatable protozoal syndrome.",
    ],
  },
  {
    qid: 1597,
    reason: "Remove routine radiography for nonspecific low back pain without red flags and continue active nonopioid management with reassessment.",
    sources: [
      "https://choosingwiselycanada.org/recommendation/spine/",
      "https://choosingwiselycanada.org/recommendation/radiology/",
    ],
    options: [
      "Advise strict bed rest for 5 to 7 days",
      "Order plain radiography of the lumbar spine",
      "Refer for urgent neurosurgical consultation",
      "Start oxycodone-acetaminophen",
      "Continue active nonopioid care, review analgesia and function, and reassess without routine imaging",
    ],
    answerIndex: 4,
    explanation: [
      "Continue active nonopioid care, review analgesia and function, and reassess without routine imaging.",
      "This patient has nonspecific axial low back pain without trauma, constitutional features, cancer risk, infection risk, cauda equina symptoms, or a neurologic deficit. Symptom duration alone does not make plain radiography useful, and common incidental findings can lead to unnecessary intervention.",
      "The next visit should revisit the diagnosis, function, adherence, and safe nonopioid symptom control while encouraging activity. Imaging becomes appropriate when a red flag emerges or when it is needed to plan a specific evidence-based intervention for a defined spinal condition.",
    ],
    keyPoints: "Do not routinely image low back pain without red flags or a treatment-planning indication. Continue activity and individualized nonopioid management, reassess function and diagnosis, and safety-net for new neurologic or systemic features.",
    optionRationales: [
      "Incorrect. Prolonged bed rest delays recovery and is not recommended for nonspecific pain.",
      "Incorrect. Plain radiography is not routinely indicated without a red flag or a specific management consequence.",
      "Incorrect. There is no neurologic emergency or surgically defined lesion.",
      "Incorrect. Routine opioid escalation is not the preferred next step for nonspecific low back pain.",
      "Correct. Active conservative care and structured reassessment are appropriate while red flags remain absent.",
    ],
  },
  {
    qid: 1616,
    reason: "Retain withdrawal of the suspected herbal hepatotoxin while adding evaluation for alternative causes and short-interval follow-up.",
    sources: ["https://easl.eu/publication/cpg-drug-induced-liver-injury/"],
    options: [
      "Refer immediately for liver biopsy without further evaluation",
      "Stop the herbal supplement now, assess for alternative causes, and repeat liver tests promptly",
      "Reduce the supplement dose by half and repeat laboratory testing in 3 months",
      "Order an ultrasound while the patient continues the supplement",
      "Start ursodeoxycholic acid so the supplement can be continued",
    ],
    answerIndex: 1,
    explanation: [
      "Stop the herbal supplement now, assess for alternative causes, and repeat liver tests promptly.",
      "A new hepatocellular enzyme elevation after starting an herbal product raises concern for herbal and dietary supplement-induced liver injury. The potentially causative product should be stopped because continued exposure can worsen injury.",
      "Drug-induced liver injury is a diagnosis of exclusion. Evaluation should review all exposures and assess competing causes such as viral hepatitis, autoimmune disease, ischemia, and biliary or structural disease as indicated. Short-interval clinical and biochemical follow-up confirms improvement or identifies progression requiring urgent referral.",
    ],
    keyPoints: "Immediately discontinue a suspected nonessential hepatotoxic supplement. DILI and HDS-related injury require exclusion of alternative causes. Follow symptoms, bilirubin, INR, and liver enzymes closely, and escalate worsening or impaired synthetic function.",
    optionRationales: [
      "Incorrect. Biopsy is reserved for diagnostic uncertainty, atypical disease, or failure to improve after initial evaluation.",
      "Correct. Withdrawal, alternative-cause evaluation, and close follow-up are the core initial actions.",
      "Incorrect. Dose reduction leaves the patient exposed to a potentially hepatotoxic product.",
      "Incorrect. Imaging may be part of evaluation, but the suspected product should not be continued while awaiting it.",
      "Incorrect. Ursodeoxycholic acid does not make continued exposure safe and is not routine antidotal therapy.",
    ],
  },
  {
    qid: 11290,
    reason: "Replace supportive care alone with curative antihelminthic treatment for classic cutaneous larva migrans in a child older than 2 years.",
    sources: [
      "https://www.cdc.gov/zoonotic-hookworm/hcp/clinical-care/index.html",
      "https://www.cdc.gov/yellow-book/hcp/post-travel-evaluation/post-travel-dermatologic-conditions.html",
    ],
    options: [
      "Prescribe oral antibiotics",
      "Use topical corticosteroid alone",
      "Use an oral antihistamine alone",
      "Treat with oral albendazole 400 mg daily for 3 days",
      "Perform a skin scraping before treatment",
    ],
    answerIndex: 3,
    explanation: [
      "Treat with oral albendazole 400 mg daily for 3 days.",
      "Intensely pruritic serpiginous tracks after barefoot sand exposure are diagnostic of cutaneous larva migrans from zoonotic hookworm larvae. The diagnosis is clinical, and antihelminthic therapy shortens the course and is curative.",
      "For children older than 2 years, CDC guidance lists albendazole 400 mg by mouth daily for 3 days. Antihistamines or topical corticosteroids may relieve itch but do not replace parasite-directed treatment.",
    ],
    keyPoints: "Cutaneous larva migrans causes slowly advancing, intensely pruritic serpiginous tracks after contaminated soil or sand exposure. Diagnose clinically and treat with albendazole or ivermectin using age-appropriate dosing.",
    optionRationales: [
      "Incorrect. Antibiotics are reserved for a secondary bacterial infection.",
      "Incorrect. A topical corticosteroid may reduce itch but does not eradicate the larvae.",
      "Incorrect. An antihistamine is only symptomatic treatment.",
      "Correct. Albendazole is curative and the listed regimen is appropriate for a 3-year-old child.",
      "Incorrect. Skin scraping is low yield and unnecessary for a classic clinical presentation.",
    ],
  },
  {
    qid: 11386,
    reason: "Replace delayed dexamethasone with first-line vasopressor therapy for persistent hypotension after fluid resuscitation.",
    sources: [
      "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
    ],
    options: [
      "Administer intravenous immunoglobulin",
      "Start an intravenous norepinephrine infusion",
      "Start continuous renal replacement therapy",
      "Begin plasmapheresis",
      "Perform immediate splenectomy",
    ],
    answerIndex: 1,
    explanation: [
      "Start an intravenous norepinephrine infusion.",
      "The patient has septic shock with persistent hypotension despite aggressive fluid resuscitation. After cultures and empiric antibiotics, the immediate hemodynamic priority is a vasopressor to restore perfusion pressure. Norepinephrine is the recommended first-line vasopressor for adults with septic shock.",
      "Adjunctive dexamethasone for suspected bacterial meningitis is most useful before or with the first antibiotic dose and does not substitute for vasopressor support. If shock remains vasopressor dependent, other adjuncts, including corticosteroid strategies, can be considered after immediate circulation is supported.",
    ],
    keyPoints: "Persistent hypotension after initial sepsis fluid resuscitation requires prompt vasopressor therapy. Norepinephrine is first line in adult septic shock. Do not delay hemodynamic support for diagnostic or adjunctive therapies.",
    optionRationales: [
      "Incorrect. IVIG is not first-line hemodynamic treatment for meningococcal septic shock.",
      "Correct. Norepinephrine is the first-line vasopressor for fluid-refractory septic shock.",
      "Incorrect. Renal replacement therapy requires a renal indication and does not correct distributive shock.",
      "Incorrect. Plasmapheresis is not standard initial treatment for meningococcal sepsis.",
      "Incorrect. Splenectomy would not treat the shock and would increase susceptibility to encapsulated organisms.",
    ],
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeCompact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function contentFingerprint(question) {
  return sha256(`${normalizeCompact(question.stem)}|${question.options.map(normalizeCompact).join("|")}`);
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const questionByQid = new Map(snapshot.questions.map((question) => [question.qid, question]));
const seenQids = new Set();
const supersededByFullReview = new Set([1507, 1510, 1517, 1526, 1527, 1531]);
const updates = corrections.filter((correction) => !supersededByFullReview.has(correction.qid)).map((correction) => {
  if (seenQids.has(correction.qid)) throw new Error(`Duplicate correction qid ${correction.qid}.`);
  seenQids.add(correction.qid);
  const current = questionByQid.get(correction.qid);
  if (!current) throw new Error(`Question ${correction.qid} is absent from the snapshot.`);
  if (correction.optionRationales.length !== correction.options.length) {
    throw new Error(`Question ${correction.qid} has mismatched option rationales.`);
  }
  if (correction.answerIndex < 0 || correction.answerIndex >= correction.options.length) {
    throw new Error(`Question ${correction.qid} has an invalid answer index.`);
  }
  const optionExplanations = Object.fromEntries(correction.optionRationales.map((value, index) => [String(index), value]));
  const patch = {
    ...(correction.stem ? { stem: correction.stem } : {}),
    options: correction.options,
    answer_index: correction.answerIndex,
    explanation: correction.explanation,
    answer_key: `The correct answer is Option ${correction.answerIndex + 1}: ${correction.options[correction.answerIndex]}. ${correction.explanation[1]}`,
    key_points: correction.keyPoints,
    option_explanations: optionExplanations,
    references_text: correction.sources.join("\n"),
    needs_review: false,
    review_note: null,
  };
  const projected = { ...current, ...patch };
  if (new Set(projected.options.map(normalizeCompact)).size !== projected.options.length) {
    throw new Error(`Question ${correction.qid} has duplicate normalized options.`);
  }
  return {
    qid: correction.qid,
    expected_fingerprint: current.content_fingerprint,
    reason: correction.reason,
    sources: correction.sources,
    projected_fingerprint: contentFingerprint(projected),
    patch,
  };
});

const batch = {
  schema_version: 2,
  batch_id: "targeted-medical-corrections-v2",
  generated_at: new Date().toISOString(),
  update_count: updates.length,
  updates,
  deletions: [],
};

await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ batch_path: batchPath, update_count: updates.length }, null, 2));
