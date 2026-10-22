# MedPass Lab v6

MedPass Lab is a responsive offline capable simulation app for practicing an N1009 medication pass and conversational bedside checks. It includes 20 adapted fictional eMAR scenarios and focused medication drills, patient and instructor interaction, documented six rights checks, a 30 minute timer, and a simulated S/U report. It is **educational practice software**, not medical decision support or an official faculty grading tool.

## Publication permission

**The app requester has confirmed with their instructor and college that the supplied FRCC workbook and medication checkoff checklist materials may be published publicly.** This report of permission is accepted for this project, but the app developer has not independently examined the approval terms. All public cases use fictional identifiers (Practice Patient, 01/01/1950, Sim Bed 1); actual patient information is not included. The app's extra instant failure rules are *educational simulation rules* and should not be described as an official FRCC scoring rubric. This README intentionally references the origin of the permitted instructional materials.

## Start

For **offline file practice**, open `N1009_MedPass_Lab.html`. For **GitHub Pages**, upload the contents of this folder to the root of your repository, then enable Pages from the main branch and root directory. Visiting the Pages URL installs offline assets where the browser supports service workers. HTTPS or localhost is required for service workers; local standalone HTML works without one.

## Interactivity

The practice patient and instructor use a **keyword matched conversation engine**, not AI or speech recognition. Select the conversation recipient and type naturally. Examples:

* Patient: “Can you state your full name?”, “What is your date of birth?”, “Do you have any drug allergies?”, “Is swallowing difficult?”, “How bad is your pain?”, “Would you prefer one pill at a time?”, “Which injection site would you prefer?”, “Do you need water?”, “These tablets could make you dizzy.”
* Instructor: “What is their blood pressure?”, “Can I get respirations and SpO2?”, “Clarify the NPH dose”, “What are the adverse effects?”, “How does this drug work?”

The patient may request water at the bedside, correct an explicitly incorrect name, report worsening pain, or report increased sleepiness after a simulated opioid. Dizziness answers now reflect the selected scenario's findings, including the hypotensive furosemide safety challenge. Questions about blood thinners, other medicines, or specific drugs draw on today's simulated orders while explaining that the home medication history is not fully known. Questions such as “Are you Taking Warfarin?” and “Are you taking any other medicines?” are handled as medication history, not as an incorrect patient name. Medication recognition is automatically derived from all eMAR and drill cases, generic reference names, and every trade name in the reference table (including each name separated by a slash). For example, Tylenol, Colace, Lasix, Coumadin, Jantoven, Percocet and Benadryl resolve without a manually maintained list. Responses link brands to the matching generic MAR order while keeping home medication history explicitly unverified. Questions such as “Are you having any pain?” and “Are you feeling dizzy?” are treated as symptom assessments, not identity mismatches. Unknown questions are answered by the selected conversation recipient. Asking the proctor for clinical findings updates the bedside status card. A simulated opioid reassessment action adds fictional repeat respiratory, oxygenation, pain and alertness findings.

The interface uses responsive vector illustrations rather than platform specific emoji for patient and instructor portraits. The dialogue uses `role="log"`, `aria-live="polite"`, and a separate persistent status announcer to accommodate full viewport redraws. On narrow screens the conversation is placed above the workbench rather than below the entire page.

Coached mode offers immediate feedback on unsafe steps and permits correction, but critical errors remain documented in the final report. Checkoff mode retains the immediate unsafe termination rules. Neither mode can evaluate real clinical skill or actual patient findings.

## Canonical build and cache management

**Never hand edit the generated standalone file or `sw.js`.** Only edit source files. Node.js 18 or newer is needed to build and run the core checks. Python and a browser are **not required** for normal development or for `node test_release.js`. They are required only for the full browser test option and for generating a release package. JavaScript app usage itself still requires no package installation.

```sh
node build.js
node test_release.js
node build.js --check

# Full integration tests before publishing, requires Python Playwright and Chromium
node test_release.js --browser

# Generates both release downloads, including the mandatory browser checks
python3 package_release.py
```

`build.js` embeds `styles.css`, `data.js`, `dialog_engine.js`, and `app.js` into `N1009_MedPass_Lab.html`, while preserving a separate source based PWA. It fingerprints the assets in the service worker cache name. **Any source modification creates a new service worker file**, even before increasing the public release version. For versioned releases, change `release.json` to the next version, run the build and tests, then publish. Network first asset updates and offline fallback remain enabled. The service worker removes only cache entries starting with `medpass-lab-`.

The release suite compares generated output against source and checks the keyword matcher, future drug vocabulary, scenario specific furosemide dizziness, medication history responses, 20 synthetic cases, patient identifiers, default checkoff mode, vaccine wording, heparin values, cache fingerprint and accessibility hooks. **`node test_release.js` runs the core regression suite with only Node. `node test_release.js --browser` additionally runs the real Chromium browser tests, including both furosemide assessment states and eMAR 1 with Docusate, Acetaminophen, and Heparin plus branded drug questions. The release packager always runs the full browser suite and stops if those tests cannot execute or fail.** The browser executable is found from `CHROMIUM_PATH` if set, otherwise from the operating system PATH, then from Playwright's bundled browser. You can also set `PYTHON` to choose the Python interpreter. Install Playwright with `python -m pip install playwright` and a Chromium executable or `python -m playwright install chromium`. Package creation is handled by `package_release.py`, so the standalone artifact and zip share the same tested sources. **Run `node test_release.js` after every source edit, and run the browser option before publication.**

## Files

* `index.html` PWA entry
* `app.js` actions, simulation workflow, safety and communication response logic
* `dialog_engine.js` reusable testable free text keyword matcher
* `data.js` normalized scenario cases
* `cases.json` human readable scenario case copy
* `styles.css` responsive styles
* `sw.template.js` original service worker template
* `sw.js` **generated** fingerprinted service worker
* `release.json` public release number
* `build.js` canonical standalone and service worker builder
* `test_release.js` release regression checks
* `dialogue_browser.py` browser integration checks for furosemide drills and multi-medication eMAR 1
* `N1009_MedPass_Lab.html` **generated** independent HTML app
* `manifest.webmanifest`, `icon.svg` PWA metadata

## Source limitations and safety

The workbook has no patient specific insulin correction scale and some NPH orders lack dose units. The example correction scale and 12 unit NPH clarification are fictional. Patient ages and birthday are synthetic. The uploaded eMAR omits real expiration dates; the sample 12/2028 date is training data. Unusual 18 mg IM normal saline orders are lab exercises, not normal clinical orders. The 5 mL influenza multidose vial is **not** a patient dose. The 2026 to 2027 US influenza formulation is trivalent Fluzone although the older course list says “Fluzone Quadrivalent.” The checklist and slides differ in some vial and needle teaching; check current faculty instructions, manufacturer labeling and institutional policy before real administration.

This app cannot verify physical hand hygiene, technique, student competence, or any clinical drug order. Checkoff scores are for self practice only. No network requests or external data processors are required by the app itself, and results are kept on device unless you export them manually.
