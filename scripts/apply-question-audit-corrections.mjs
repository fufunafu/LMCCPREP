#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const { loadEnvConfig } = nextEnvironment;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const applyChanges = process.argv.includes("--apply");

// Safety: writes require --project <ref> matching the Supabase project in the environment.
const projectFlagIndex = process.argv.indexOf("--project");
const requestedProject = projectFlagIndex >= 0 ? process.argv[projectFlagIndex + 1]?.trim() : undefined;
const configuredProject = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return undefined;
  }
})();
if (!requestedProject || requestedProject.startsWith("--")) {
  console.error(`Refusing to run: pass --project <ref> (the environment points at project "${configuredProject ?? "unknown"}").`);
  process.exit(1);
}
if (requestedProject !== configuredProject) {
  console.error(`Refusing to run: --project ${requestedProject} does not match the configured Supabase project "${configuredProject ?? "unknown"}".`);
  process.exit(1);
}
const apiHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

const requiredTopics = [
  { id: "psychiatry/schizophrenia", subject_id: "psychiatry", name: "Schizophrenia" },
  {
    id: "psychiatry/suicide-risk-assessment",
    subject_id: "psychiatry",
    name: "Suicide risk assessment",
  },
  {
    id: "pediatrics/acute-otitis-media",
    subject_id: "pediatrics",
    name: "Acute otitis media",
  },
];

const staticUpdates = [
  {
    qid: 12182,
    expectedFingerprint: "be5e872bc6c4af22ddb2e9f2baed273798e97b812aa41d4927850503bbab35f4",
    patch: {
      stem: "A 14-year-old boy has had multiple motor tics and at least one vocal tic for more than 1 year. His symptoms include blinking, facial grimacing, and throat clearing. He has no evidence of an eye disorder or upper respiratory infection. Which psychiatric condition is commonly associated with Tourette syndrome?",
      options: [
        "Oppositional defiant disorder",
        "Conduct disorder",
        "Obsessive-compulsive disorder",
        "Developmental coordination disorder",
        "Schizophrenia",
      ],
      explanation: [
        "The correct answer is obsessive-compulsive disorder.",
        "Tourette syndrome is defined by multiple motor tics and at least one vocal tic that persist for more than 1 year, with onset before age 18. Attention-deficit/hyperactivity disorder and obsessive-compulsive disorder are the two most common psychiatric comorbidities.",
        "The other options can occur in adolescents but are not as characteristically associated with Tourette syndrome.",
      ],
      references_text: "Centers for Disease Control and Prevention. About Tourette Syndrome. Reviewed May 15, 2024. https://www.cdc.gov/tourette-syndrome/about/index.html",
    },
  },
  {
    qid: 12318,
    expectedFingerprint: "2d7b0f91778e46c548c2823b54eb38cb6f4db1035a3c9b032f93968e931868d8",
    patch: {
      stem: "A cohort study follows 100 people exposed to risk factor Y and 100 people not exposed to Y. The results are shown below.\n\n| Group | Developed disease X | Did not develop disease X | Total |\n|---|---:|---:|---:|\n| Exposed to Y | 80 | 20 | 100 |\n| Not exposed to Y | 50 | 50 | 100 |\n\nWhat is the attributable risk of disease X associated with exposure to Y?",
      explanation: [
        "The correct answer is 0.3.",
        "Attributable risk is the incidence in the exposed group minus the incidence in the unexposed group.",
        "Incidence among exposed people = 80/100 = 0.80. Incidence among unexposed people = 50/100 = 0.50. Therefore, attributable risk = 0.80 - 0.50 = 0.30.",
      ],
    },
  },
  {
    qid: 12456,
    expectedFingerprint: "e690666e272161b19f21c147ca579ba202d96ef16f6b48986ebccf20d2a0352c",
    patch: {
      topic_id: "psychiatry/schizophrenia",
      stem: "The approximate lifetime concordance rate for schizophrenia in monozygotic twins is:",
      explanation: [
        "The correct answer is 40%.",
        "Schizophrenia is multifactorial, with important genetic and environmental contributions. Published twin studies commonly estimate concordance in monozygotic twins at about 40% to 50%, compared with substantially lower concordance in dizygotic twins. A 40% estimate is therefore the best answer among the choices.",
        "Concordance below 100% in genetically identical twins also shows that genetic susceptibility is not sufficient by itself to cause schizophrenia.",
      ],
      needs_review: false,
      review_note: null,
      references_text: "Hilker R, et al. Heritability of Schizophrenia and Schizophrenia Spectrum Based on the Nationwide Danish Twin Register. Biol Psychiatry. 2018;83(6):492-498. doi:10.1016/j.biopsych.2017.08.017",
    },
  },
  {
    qid: 12817,
    expectedFingerprint: "449817e3526886e6ed2fa3f68529cac75d8f90536952efd63fb72aea185a1bce",
    patch: {
      topic_id: "psychiatry/suicide-risk-assessment",
      stem: "A 68-year-old man with major depressive disorder, alcohol use disorder, chronic pain, and a previous suicide attempt reports that he intends to shoot himself today. He has selected a time and place and has immediate access to a loaded firearm. Which finding most strongly indicates acute suicide risk requiring immediate safety intervention?",
      options: [
        "Male sex",
        "Age greater than 65 years",
        "Living alone",
        "Chronic physical illness",
        "Current intent, a specific plan, and access to lethal means",
      ],
      answer_index: 4,
      explanation: [
        "The correct answer is current intent, a specific plan, and access to lethal means.",
        "No single demographic characteristic can predict suicide. A current intention to die, a specific and imminent plan, and immediate access to a highly lethal method indicate an acute emergency, especially in a patient with a previous attempt, depression, substance use, and chronic pain.",
        "The patient should not be left alone. Immediate safety measures include emergency psychiatric assessment, collaborative removal or secure storage of lethal means, and treatment of intoxication, withdrawal, or other acute medical problems. Demographic and chronic risk factors contribute to the overall formulation but are less important than the imminent intent and plan in this scenario.",
      ],
      needs_review: false,
      review_note: null,
      references_text: "Public Health Agency of Canada. Suicide: risks and prevention. Updated June 2026. https://www.canada.ca/en/public-health/services/suicide-prevention/suicide-risks-prevention.html",
    },
  },
  {
    qid: 12861,
    expectedFingerprint: "48f48db41bace4bc1019376ec5bbffcefd47282dc0214d660e1d6dc9cc3833b2",
    patch: {
      stem: "A newborn girl has marked lymphedema of the hands and feet and a webbed neck after resolution of a prenatal cystic hygroma. Turner syndrome is suspected. All of the following are appropriate diagnostic or management steps for Turner syndrome, except:",
      explanation: [
        "The correct answer is brain MRI.",
        "The infant's hand and foot lymphedema, webbed neck, and prenatal cystic hygroma are characteristic of Turner syndrome. Chromosome analysis is used to confirm the diagnosis.",
        "Cardiac assessment with echocardiography and renal ultrasonography are recommended because congenital cardiovascular and renal anomalies are common. Growth hormone is offered when there is evidence of growth failure or short stature. Routine brain MRI is not part of the standard Turner syndrome evaluation in an infant without neurologic findings.",
      ],
      has_figure: false,
      references_text: "Gravholt CH, et al. Clinical practice guidelines for the care of girls and women with Turner syndrome: Proceedings from the 2023 Aarhus International Turner Syndrome Meeting. Eur J Endocrinol. 2024;190(6):G53-G151. https://pmc.ncbi.nlm.nih.gov/articles/PMC11759048/",
    },
  },
  {
    qid: 12892,
    expectedFingerprint: "052fd8be571a907586a8578d5e2acb18abcee3ca20538451ddcce983ba50b393",
    patch: {
      stem: "A 61-year-old man with metastatic melanoma has had adequate relief of pain and nausea after adjustment of his palliative medications. For the past 3 weeks, however, he has remained hopeless and has lost interest in conversations with his family, music, and other activities he previously valued, even on days when his physical symptoms are controlled. Which finding most strongly supports major depressive disorder rather than an expected response to terminal illness?",
      options: [
        "Reduced appetite during chemotherapy",
        "Occasional discouragement when discussing prognosis",
        "Insomnia while admitted to hospital",
        "Low energy after radiation treatment",
        "Persistent pervasive loss of interest in family and valued activities",
      ],
      explanation: [
        "The correct answer is persistent pervasive loss of interest in family and valued activities.",
        "Pervasive anhedonia that persists even when pain and nausea are controlled is a core feature of major depressive disorder. Appetite loss, insomnia, and low energy can result directly from advanced cancer, treatment, or hospitalization. Sadness and discouragement can be proportionate responses to a poor prognosis.",
        "Any statement about wanting to die still requires direct assessment of suicidal thoughts, intent, plan, access to means, and immediate safety, regardless of whether a depressive disorder has been established.",
      ],
    },
  },
  {
    qid: 13058,
    expectedFingerprint: "8636d29d6eaf5c797649e26d57641a6cc06721acc84cfee1f6ba7a915b5386b0",
    patch: {
      stem: "A 58-year-old woman has bradykinesia, rigidity, and a resting tremor caused by Parkinson disease. Which statement about symptomatic treatment is correct?",
      options: [
        "Motor symptoms should remain untreated until severe disability develops",
        "Levodopa is the most effective medication for improving motor symptoms",
        "Levodopa and dopamine agonists should be started at high doses",
        "Dopamine agonists cause fewer important adverse effects than levodopa in all age groups",
        "Anticholinergic drugs improve bradykinesia more reliably than tremor",
      ],
      explanation: [
        "The correct answer is that levodopa is the most effective medication for improving motor symptoms.",
        "Levodopa provides the greatest symptomatic benefit for bradykinesia and rigidity and also improves tremor. Treatment is individualized according to symptoms, function, age, comorbidity, and patient preferences. Dopaminergic therapy is started at a low dose and titrated to benefit.",
        "Dopamine agonists can cause somnolence, hallucinations, edema, and impulse-control disorders. Anticholinergic drugs may reduce tremor in selected younger patients but have limited benefit for bradykinesia and can cause cognitive and other anticholinergic adverse effects.",
      ],
    },
  },
  {
    qid: 13289,
    expectedFingerprint: "0b88f26860f9d7cafa64f092eea11f1ece27538ee5cc0d26a0390dcb314f4e0d",
    patch: {
      stem: "A 61-year-old man with metastatic melanoma is admitted with constant severe back and hip pain despite his current analgesic regimen. He says, \"I cannot bear this pain and sometimes wish I would not wake up.\" He denies a plan or intent to harm himself during an immediate suicide safety assessment. Which is the most appropriate initial intervention?",
      options: [
        "Rapidly optimize analgesia while continuing safety assessment and support",
        "Transfer him immediately to a psychiatric service",
        "Begin an antidepressant without addressing his pain",
        "Initiate parenteral nutrition",
        "Defer symptom treatment until he attends a cancer support group",
      ],
      explanation: [
        "The correct answer is to rapidly optimize analgesia while continuing safety assessment and support.",
        "Severe uncontrolled pain is an urgent source of suffering in advanced cancer. After immediate assessment has found no current plan or intent, prompt symptom control is the priority. Analgesia should be reassessed frequently, and palliative care involvement can help address physical, psychological, social, and spiritual needs.",
        "A wish for death must never be dismissed as merely a pain symptom. Suicide risk assessment and safety planning continue alongside treatment. Psychiatric care or antidepressant treatment may be indicated if a depressive disorder, persistent suicidal intent, or another psychiatric emergency is identified, but neither replaces immediate pain control.",
      ],
    },
  },
  {
    qid: 14188,
    expectedFingerprint: "88c5b24d9fda66293dffe4a39bb72446f24cc138f7036e5356d76d3d497a669c",
    patch: {
      stem: "A 3-week-old infant has poor feeding, constipation, prolonged sleep, a weak hoarse cry, decreased activity, and a large protruding tongue. Which diagnosis best explains these findings?",
      explanation: [
        "The correct answer is congenital hypothyroidism.",
        "Congenital hypothyroidism can present with lethargy, poor feeding, constipation, hypotonia, a weak or hoarse cry, prolonged sleep, macroglossia, prolonged jaundice, large fontanelles, and an umbilical hernia. Many newborns have few findings initially, which is why newborn screening is essential.",
        "An abnormal newborn screen requires prompt confirmatory serum testing and treatment with levothyroxine to prevent neurodevelopmental impairment.",
      ],
      has_figure: false,
      references_text: "American Academy of Pediatrics. Congenital Hypothyroidism: Screening and Management. Pediatrics. 2023;151(1):e2022060420. doi:10.1542/peds.2022-060420",
    },
  },
  {
    qid: 14557,
    expectedFingerprint: "208880bf283ab89039a725fa64c69fe0ef015c0af5b279ad2cd19b6c5540b58b",
    patch: {
      stem: "A 72-year-old woman with established Parkinson disease has worsening rigidity and bradykinesia shortly after a medication is added for agitation. Which medication is most likely responsible for worsening her parkinsonism?",
      options: [
        "Levodopa",
        "Bromocriptine",
        "Chlorpromazine",
        "Pramipexole",
        "Selegiline",
      ],
      explanation: [
        "The correct answer is chlorpromazine.",
        "Chlorpromazine blocks dopamine D2 receptors and can cause drug-induced parkinsonism or worsen established Parkinson disease. Dopamine-blocking antipsychotics should generally be avoided when safer alternatives are available.",
        "Levodopa, dopamine agonists such as bromocriptine or pramipexole, and the monoamine oxidase B inhibitor selegiline can all improve motor symptoms in Parkinson disease.",
      ],
    },
  },
  {
    qid: 14558,
    expectedFingerprint: "1919a5708710f61f96c9e67f6cce3e90f3fc474a0c6bbf1ebd8b2ccdc4c7ce87",
    patch: {
      stem: "A 34-year-old patient is found to have microscopic hematuria. Urine microscopy shows numerous dysmorphic red blood cells and red blood cell casts. These findings most strongly indicate that the blood originates from which site?",
      options: [
        "Lower urinary tract infection",
        "Degradation in a delayed urine sample",
        "Glomerular bleeding",
        "Urothelial malignancy",
        "Urinary tract calculus",
      ],
      explanation: [
        "The correct answer is glomerular bleeding.",
        "Dysmorphic red blood cells, especially acanthocytes, form as erythrocytes pass through a damaged glomerular filtration barrier and traverse renal tubules. Red blood cell casts also strongly support glomerulonephritis and therefore a glomerular source of hematuria.",
        "Urinary infection, stones, and urothelial malignancy more often produce isomorphic red blood cells and do not produce red blood cell casts.",
      ],
    },
  },
  {
    qid: 14636,
    expectedFingerprint: "083a04cc199ed02ed681f4bd4979949e835c16dc7bba832e80298bf10f11e901",
    patch: {
      stem: "A cohort study follows 100 workers exposed to chemical Z and 100 workers who are not exposed. The results are shown below.\n\n| Group | Developed dermatitis | Did not develop dermatitis | Total |\n|---|---:|---:|---:|\n| Exposed to Z | 40 | 60 | 100 |\n| Not exposed to Z | 25 | 75 | 100 |\n\nWhat is the relative risk of dermatitis among exposed workers compared with unexposed workers?",
      explanation: [
        "The correct answer is 1.6.",
        "Relative risk is the incidence in the exposed group divided by the incidence in the unexposed group.",
        "Incidence among exposed workers = 40/100 = 0.40. Incidence among unexposed workers = 25/100 = 0.25. Therefore, relative risk = 0.40/0.25 = 1.6.",
      ],
    },
  },
  {
    qid: 14651,
    expectedFingerprint: "793a595be37c8096077f5b8b5cb5cd0850686e68514e3ff84eaff94224efe4ec",
    patch: {
      topic_id: "pediatrics/acute-otitis-media",
      has_figure: false,
    },
  },
  {
    qid: 14743,
    expectedFingerprint: "cc029720a3ead6863c2e8cfc02c2325626cd7178976af4dcfe84e37aa4d8dae7",
    patch: {
      stem: "Which factor increases the risk of elder abuse or neglect in a caregiving relationship?",
      options: [
        "Reliable respite care and strong social support",
        "Improving independence in activities of daily living",
        "Routine opportunities for the older adult to speak privately with a clinician",
        "Caregiver education and access to community resources",
        "High caregiver stress combined with financial dependence on the older adult",
      ],
      explanation: [
        "The correct answer is high caregiver stress combined with financial dependence on the older adult.",
        "Elder abuse is multifactorial. Recognized risk factors include social isolation, cognitive or functional impairment, caregiver stress, substance use, a history of family violence, and financial or housing dependence within the relationship. These factors raise concern but do not prove abuse.",
        "Clinicians should speak with the older adult privately, assess immediate safety and decision-making capacity, document findings objectively, and follow provincial or territorial reporting and safeguarding requirements. Respite services, caregiver education, and social support can reduce strain and improve safety.",
      ],
      references_text: "Public Health Agency of Canada. Elder abuse in Canada. https://www.canada.ca/en/public-health/services/health-promotion/aging-seniors/elder-abuse.html",
    },
  },
  {
    qid: 15266,
    expectedFingerprint: "05558a6139730fc2cc9f4565c95027836318450e9f36ab91599c0708fa60cf0a",
    patch: {
      stem: "A 31-year-old man with sickle cell disease has severe right eye pain after being struck by a soccer ball. Slit-lamp examination shows a visible horizontal layer of blood in the anterior chamber. Intraocular pressure is 36 mmHg. Compared with patients without sickle cell disease, he is at particularly high risk for which complication?",
      options: [
        "Posterior synechiae",
        "Macular scarring",
        "Corneal blood staining",
        "Optic atrophy",
        "Choroidal rupture",
      ],
      explanation: [
        "The correct answer is optic atrophy.",
        "The layered blood in the anterior chamber is a traumatic hyphema. In sickle cell disease, erythrocytes can sickle within the relatively hypoxic anterior chamber and obstruct the trabecular meshwork, producing marked intraocular pressure elevation even with a relatively small hyphema.",
        "People with sickle cell hemoglobinopathy can develop glaucomatous optic nerve injury and optic atrophy at lower pressures and over a shorter duration than other patients. This is an ophthalmic emergency requiring urgent specialist management.",
      ],
      has_figure: false,
      references_text: "American Academy of Ophthalmology EyeWiki. Hyphema. https://eyewiki.org/Hyphema",
    },
  },
  {
    qid: 15371,
    expectedFingerprint: "8456f59d577097182daea638e85fe0a855b359dc7dd83eb36c88d0991b064e30",
    patch: {
      stem: "A 61-year-old man taking prednisone for temporal arteritis presents within 48 hours of developing a painful, pruritic eruption. Examination shows grouped vesicles on an erythematous base in a unilateral thoracic dermatomal distribution that does not cross the midline. He is clinically stable and has no ocular involvement or lesions outside that dermatome. Which treatment plan is most appropriate among the choices?",
      explanation: [
        "The correct answer is acyclovir and gabapentin.",
        "The unilateral dermatomal vesicular eruption is localized herpes zoster. Antiviral therapy is indicated, particularly because treatment began within 72 hours and the patient is immunosuppressed. Oral acyclovir is an appropriate antiviral for clinically stable localized disease, and gabapentin can be used for significant neuropathic pain.",
        "Disseminated disease, visceral involvement, severe immunosuppression, or ophthalmic zoster would require urgent specialist assessment and often intravenous acyclovir. Zoster vaccine is preventive and is not treatment for an active episode.",
      ],
      has_figure: false,
      references_text: "Centers for Disease Control and Prevention. Clinical Overview of Shingles. Updated June 27, 2024. https://www.cdc.gov/shingles/hcp/clinical-overview/index.html",
    },
  },
  {
    qid: 18511,
    expectedFingerprint: "7e0f5b8cae23aa7609e091ae9869cf517020a8e2f458ffc62feb5ae7b4f3945e",
    patch: {
      stem: "A table shows the 10-year cumulative incidence of stroke among men aged 50 to 60 years.\n\n| Diabetes | Hypertension | Stroke incidence per 1,000 over 10 years |\n|---|---|---:|\n| No | No | 20 |\n| Yes | No | 40 |\n| No | Yes | 60 |\n| Yes | Yes | 80 |\n\nWhat is the relative risk of stroke for a patient with both diabetes and hypertension compared with a patient who has neither condition?",
      explanation: [
        "The correct answer is 4.0.",
        "The 10-year risk in patients with both diabetes and hypertension is 80/1,000 = 0.08. The risk in patients with neither condition is 20/1,000 = 0.02.",
        "Relative risk = 0.08/0.02 = 4.0. Therefore, the group with both conditions has four times the 10-year stroke risk of the group with neither condition.",
      ],
      has_figure: false,
    },
  },
];

const dynamicUpdates = [
  {
    qid: 1050,
    expectedFingerprint: "51b8e9349ad6c4528bcc3d4d34bf6d82819578ea87bc975e3464678cc8b6274c",
    buildPatch(row) {
      const explanation = [...row.explanation];
      explanation[0] = "The correct answer is option 3 (Option C).";
      const sourceRaw = row.source_raw ? { ...row.source_raw } : null;
      if (sourceRaw?.answerKey) {
        sourceRaw.answerKey = sourceRaw.answerKey.replace("option 2", "option 3");
      }
      if (sourceRaw?.fr_answerKey) {
        sourceRaw.fr_answerKey = sourceRaw.fr_answerKey.replace("option 2", "option 3");
      }
      return {
        answer_key: row.answer_key.replace("option 2", "option 3"),
        explanation,
        ...(sourceRaw ? { source_raw: sourceRaw } : {}),
      };
    },
  },
  ...[13691, 14391].map((qid) => ({
    qid,
    expectedFingerprint: {
      13691: "a1262d58798626d85dcf6fdbe3b8e68112b1dfe815370cea2127e5d0bfe934ed",
      14391: "516350f752755061a07724ce7387b3e0014d6ac1554f7e1d578025634167a0cb",
    }[qid],
    buildPatch: () => ({ has_figure: false }),
  })),
  {
    qid: 18692,
    expectedFingerprint: "ad0f21441e02f9e2c2859e0e4277ef74a8502a50599080429264abbf6e923b84",
    buildPatch(row) {
      const referencesText = "1. Money DM, Allen VM. The Prevention of Early-Onset Neonatal Group B Streptococcal Disease. J Obstet Gynaecol Can. 2013;35(10):e1-e10. SOGC Clinical Practice Guideline No. 298.\n2. Public Health Agency of Canada. Family-Centred Maternity and Newborn Care: National Guidelines, Chapter 3. https://www.canada.ca/en/public-health/services/publications/healthy-living/maternity-newborn-care-guidelines-chapter-3.html";
      const sourceRaw = row.source_raw ? { ...row.source_raw, img: false, references: referencesText } : null;
      return {
        has_figure: false,
        references_text: referencesText,
        ...(sourceRaw ? { source_raw: sourceRaw } : {}),
      };
    },
  },
  {
    qid: 18883,
    expectedFingerprint: "a37cb5dc69bad2a949bf152385ebb399fd0062f8ca99b2774453978ce7a1ddda",
    buildPatch(row) {
      const answerKey = "The correct answer is **Central retinal artery occlusion (CRAO)**.\n\nThis patient has the classic findings of CRAO: sudden painless monocular vision loss, a relative afferent pupillary defect, and a pale edematous retina with a cherry-red spot. CRAO is an acute ischemic stroke of the retina. The patient requires immediate transport or triage through an emergency stroke pathway, urgent ophthalmologic assessment, and evaluation for thrombolysis when otherwise eligible. Ocular massage, anterior chamber paracentesis, and routine intraocular-pressure lowering have not been proven effective and may be harmful.";
      const keyPoints = "- CRAO causes sudden, profound, painless monocular vision loss.\n- A pale edematous retina with a cherry-red spot and a relative afferent pupillary defect are classic findings.\n- CRAO is a medical emergency and a form of acute ischemic stroke requiring immediate emergency and stroke evaluation.\n- Intravenous alteplase may be considered for eligible patients with disabling visual loss.\n- Ocular massage, anterior chamber paracentesis, and hemodilution are not evidence-based treatments and may cause harm.";
      const explanation = [
        "The correct answer is central retinal artery occlusion (CRAO).",
        "This patient has sudden, profound, painless monocular vision loss, a relative afferent pupillary defect, and a pale edematous retina with a cherry-red spot. These findings are classic for CRAO.",
        "CRAO is an acute ischemic stroke of the retina. Immediate management is emergency stroke-system triage, urgent ophthalmologic assessment, and evaluation for reperfusion therapy when the patient is otherwise eligible. Ocular massage, anterior chamber paracentesis, and routine intraocular-pressure lowering have not been proven effective and may be harmful.",
        "Key points",
        keyPoints,
      ];
      const sourceRaw = row.source_raw ? {
        ...row.source_raw,
        answerKey,
        keyPoints,
        fr_answerKey: "La bonne réponse est **l'occlusion de l'artère centrale de la rétine (OACR)**.\n\nLes signes classiques sont une perte visuelle monoculaire soudaine et indolore, un déficit pupillaire afférent relatif et une rétine pâle et œdémateuse avec une tache rouge cerise. L'OACR est un AVC ischémique aigu de la rétine. La patiente doit être orientée immédiatement vers une filière d'urgence pour AVC, avec évaluation ophtalmologique urgente et évaluation de l'admissibilité à la thrombolyse. Le massage oculaire, la paracentèse de la chambre antérieure et la réduction systématique de la pression intraoculaire n'ont pas démontré d'efficacité et peuvent être nocifs.",
      } : null;
      return {
        answer_key: answerKey,
        key_points: keyPoints,
        explanation,
        ...(sourceRaw ? { source_raw: sourceRaw } : {}),
      };
    },
  },
];

const duplicateMap = [
  [700, 1269, "CPPD synovial-fluid diagnosis"],
  [12473, 12198, "shortest benzodiazepine half-life"],
  [14668, 14465, "positive predictive value and prevalence"],
  [14254, 14754, "suspected child abuse reporting"],
  [13307, 13058, "Parkinson disease recognition and treatment cluster"],
  [17086, 17497, "breastfeeding latch trauma"],
  [14296, 14743, "elder abuse risk"],
  [15185, 13517, "septic abdominal emergency"],
  [15780, 13517, "septic abdominal emergency"],
  [19677, 15571, "adult streptococcal pharyngitis testing"],
  [13600, 14661, "osteoporotic vertebral compression fracture"],
  [13076, 19159, "adult appendicitis imaging"],
  [17539, 17640, "aortic dissection CT angiography after beta blockade"],
  [18845, 18602, "function-limiting cataract surgery"],
  [18672, 18883, "central retinal artery occlusion diagnosis"],
  [12703, 14158, "unstable ruptured abdominal aortic aneurysm"],
  [18606, 14158, "unstable ruptured abdominal aortic aneurysm"],
].map(([removeQid, keepQid, reason]) => ({ removeQid, keepQid, reason }));

const deletionFingerprints = new Map([
  [700, "8703b85999d345566f508b389280cc41830ea06b05f1c453b9762529e2060183"],
  [12473, "ffaf10c7fef2c953474be9d7b678024e5744a871c1b735b81cbf4af4aac4b3df"],
  [12703, "712ab9dddf9a9f947764a5e3ca818a2e12f274374ceb7a24990cec3520fb2fbb"],
  [13076, "0e86a5ba4a44815dd09e1af3f46cf8a8abbec1a23ecafa0ce1c6e8e920e8ee7d"],
  [13307, "47800463b922a366dc7decdb45cd6158cfd5233ba416b7adcd79f4d4b97f3815"],
  [13600, "d63793d182697b02d7bf70554ab4cb973894204694488316a9053ddfdecc6b5b"],
  [14254, "ded4c97784aef673015311aef5e92a6a49da2d4531c492d56b0a8ff4ffdbfff6"],
  [14296, "02ce9726c05991b77634294c871035413bf167c81cc7c0fa006cd793baecb11e"],
  [14668, "cfb76ef2b4f8def0bc80567d043d17e03a4ff16fc4dbf5ad7b88d76728b740bf"],
  [15185, "8fed5635d1148709794d11ab5dfaf835bd288fd544f92e914fc48ba2b4fffb97"],
  [15780, "f268423c5e3cb762c1ae581d11d203697945b3ac205a343ab8daa64cc3af0fa4"],
  [17086, "f21e4a2c15cd33038765de9d408e7372bee5f0eeb66c13ac31f5382ed0c23508"],
  [17539, "22b5ec03ef8c3322c1d9d658e3dc48dbad626c18907f94d30a2b1f098b84c811"],
  [18606, "850f5f9c82b927d41c5280fa688a630260e971b5c1d1a895277d4d7463ea3620"],
  [18672, "b6cc107dcb15757e1143d3a626a2f8815404f5aad7bfd90212640b4fa541b572"],
  [18845, "ccb9be6b93c404ccb437fb1da70680b19f6184904b5710c715045b59f059dc15"],
  [19677, "1eb0e6de0d999ca8d1456941eb08d60093f42b2c48d29e827ba96a774e8865d4"],
]);

const updateDefinitions = [
  ...staticUpdates.map((definition) => ({
    ...definition,
    buildPatch: () => definition.patch,
  })),
  ...dynamicUpdates,
];

function stripSourceArtifacts(value) {
  return String(value ?? "")
    .replace(/https?:\/f?app\.[^\s\n]*[^\n]*/giu, " ")
    .replace(/hupe:l\/app\.[^\s\n]*[^\n]*/giu, " ")
    .replace(/\b(?:medicalstudyzone|canadaqbank)\S*/giu, " ")
    .replace(/(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/gu, " ");
}

function normalizeCompact(value) {
  return stripSourceArtifacts(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function contentFingerprint(question) {
  return createHash("sha256")
    .update(`${normalizeCompact(question.stem)}|${question.options.map(normalizeCompact).join("|")}`)
    .digest("hex");
}

async function api(path, options = {}) {
  let response;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...apiHeaders, ...options.headers },
    });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
  }
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchRows(table, query) {
  return api(`${table}?${query}`);
}

async function fetchQuestions(qids) {
  const select = [
    "qid", "source", "subject_id", "topic_id", "stem", "options", "answer_index",
    "explanation", "has_figure", "figure_url", "source_pages", "needs_review",
    "review_note", "qbank_question_id", "source_category", "source_subject",
    "source_topic", "answer_key", "key_points", "option_explanations",
    "references_text", "source_raw",
  ].join(",");
  const filter = encodeURIComponent(`(${qids.join(",")})`);
  return fetchRows("questions", `select=${select}&qid=in.${filter}&order=qid.asc`);
}

async function exactCount(table, filter) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&${filter}`, {
    headers: {
      ...apiHeaders,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  const match = response.headers.get("content-range")?.match(/\/(\d+)$/u);
  if (!match) throw new Error(`${table}: missing exact Content-Range header`);
  return Number(match[1]);
}

async function dependencyCounts(qid) {
  const directTables = ["attempts", "flags", "notes", "question_edits"];
  return Object.fromEntries(await Promise.all([
    ...directTables.map(async (table) => [table, await exactCount(table, `qid=eq.${qid}`)]),
    (async () => [
      "sessions",
      await exactCount("sessions", `question_ids=cs.%7B${qid}%7D`),
    ])(),
  ]));
}

async function upsertTopic(topic) {
  return api("topics?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(topic),
  });
}

async function patchQuestion(qid, patch) {
  return api(`questions?qid=eq.${qid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

async function insertIgnore(table, row, conflictColumns) {
  return api(`${table}?on_conflict=${encodeURIComponent(conflictColumns)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

async function deleteQuestion(qid) {
  return api(`questions?qid=eq.${qid}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
}

const allQids = [...new Set([
  ...updateDefinitions.map((definition) => definition.qid),
  ...duplicateMap.flatMap(({ removeQid, keepQid }) => [removeQid, keepQid]),
])].sort((left, right) => left - right);
const questions = await fetchQuestions(allQids);
const questionById = new Map(questions.map((question) => [question.qid, question]));

const preconditionFailures = [];
for (const definition of updateDefinitions) {
  const question = questionById.get(definition.qid);
  if (!question) {
    preconditionFailures.push(`Question ${definition.qid} is missing.`);
  } else if (contentFingerprint(question) !== definition.expectedFingerprint) {
    preconditionFailures.push(`Question ${definition.qid} no longer matches its audited fingerprint.`);
  }
}
for (const { removeQid, keepQid } of duplicateMap) {
  const removed = questionById.get(removeQid);
  const kept = questionById.get(keepQid);
  if (!removed) preconditionFailures.push(`Duplicate candidate ${removeQid} is missing.`);
  if (!kept) preconditionFailures.push(`Required survivor ${keepQid} is missing.`);
  if (removed && contentFingerprint(removed) !== deletionFingerprints.get(removeQid)) {
    preconditionFailures.push(`Duplicate candidate ${removeQid} no longer matches its audited fingerprint.`);
  }
}
if (preconditionFailures.length) {
  throw new Error(`Safety preconditions failed:\n${preconditionFailures.join("\n")}`);
}

const dependencyReport = [];
for (const { removeQid } of duplicateMap) {
  const counts = await dependencyCounts(removeQid);
  dependencyReport.push({ qid: removeQid, counts });
  if (Object.values(counts).some((count) => count > 0)) {
    preconditionFailures.push(`Question ${removeQid} has user-data or session dependencies.`);
  }
}
if (preconditionFailures.length) {
  throw new Error(`Deletion safety preconditions failed:\n${preconditionFailures.join("\n")}`);
}

const removalQids = duplicateMap.map(({ removeQid }) => removeQid);
const removalFilter = encodeURIComponent(`(${removalQids.join(",")})`);
const hierarchyBackup = {
  categories: await fetchRows(
    "qbank_question_categories",
    `select=qid,category_id&qid=in.${removalFilter}&order=qid.asc,category_id.asc`,
  ),
  topics: await fetchRows(
    "qbank_question_topics",
    `select=qid,topic_id&qid=in.${removalFilter}&order=qid.asc`,
  ),
  images: await fetchRows(
    "qbank_question_images",
    `select=*&qid=in.${removalFilter}&order=qid.asc,image_index.asc`,
  ),
};

const timestamp = new Date().toISOString().replace(/[:.]/gu, "");
await mkdir(outputDirectory, { recursive: true });
const backupPath = resolve(outputDirectory, `question-correction-backup-${timestamp}.json`);
await writeFile(backupPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  mode: applyChanges ? "apply" : "dry_run",
  questions,
  hierarchy: hierarchyBackup,
  dependencies: dependencyReport,
}, null, 2)}\n`, "utf8");

const operationReport = {
  generated_at: new Date().toISOString(),
  mode: applyChanges ? "apply" : "dry_run",
  backup_path: backupPath,
  updates: [],
  deletions: [],
};

if (applyChanges) {
  for (const topic of requiredTopics) await upsertTopic(topic);
}

for (const definition of updateDefinitions) {
  const before = questionById.get(definition.qid);
  const patch = definition.buildPatch(before);
  let after = { ...before, ...patch };
  if (applyChanges) {
    const updated = await patchQuestion(definition.qid, patch);
    if (!updated || updated.length !== 1) {
      throw new Error(`Question ${definition.qid} update returned ${updated?.length ?? 0} rows.`);
    }
    [after] = updated;
  }
  operationReport.updates.push({
    qid: definition.qid,
    fields: Object.keys(patch).sort(),
    before_fingerprint: contentFingerprint(before),
    after_fingerprint: contentFingerprint(after),
  });
}

for (const mapping of duplicateMap) {
  const categoryLinks = hierarchyBackup.categories.filter(({ qid }) => qid === mapping.removeQid);
  const topicLink = hierarchyBackup.topics.find(({ qid }) => qid === mapping.removeQid);
  const imageLinks = hierarchyBackup.images.filter(({ qid }) => qid === mapping.removeQid);
  if (imageLinks.length) {
    throw new Error(`Question ${mapping.removeQid} unexpectedly has image assets; manual migration is required.`);
  }

  if (applyChanges) {
    for (const link of categoryLinks) {
      await insertIgnore(
        "qbank_question_categories",
        { qid: mapping.keepQid, category_id: link.category_id },
        "qid,category_id",
      );
    }
    if (topicLink) {
      const existingTopic = await fetchRows(
        "qbank_question_topics",
        `select=qid,topic_id&qid=eq.${mapping.keepQid}`,
      );
      if (!existingTopic.length) {
        await insertIgnore(
          "qbank_question_topics",
          { qid: mapping.keepQid, topic_id: topicLink.topic_id },
          "qid",
        );
      }
    }
    const removed = await deleteQuestion(mapping.removeQid);
    if (!removed || removed.length !== 1) {
      throw new Error(`Question ${mapping.removeQid} deletion returned ${removed?.length ?? 0} rows.`);
    }
  }

  operationReport.deletions.push({
    ...mapping,
    migrated_category_links: categoryLinks.map(({ category_id: categoryId }) => categoryId),
    source_topic_link: topicLink?.topic_id ?? null,
  });
}

const reportPath = resolve(outputDirectory, `question-correction-report-${timestamp}.json`);
await writeFile(reportPath, `${JSON.stringify(operationReport, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  mode: operationReport.mode,
  update_count: operationReport.updates.length,
  deletion_count: operationReport.deletions.length,
  backup: backupPath,
  report: reportPath,
}, null, 2));
