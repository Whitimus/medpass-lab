/* Run from project directory after edits: node test_release.js */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const forbidden=['Jean Greene','08/22/1948','FRCC Bed A','August 22, 1948'];
for(const f of ['data.js','cases.json','app.js','README.md','N1009_MedPass_Lab.html']){
  const source=read(f);
  for(const old of forbidden)assert(!source.includes(old),`${f} still contains ${old}`);
}
const cases=JSON.parse(read('cases.json'));
assert.equal(cases.length,20);
for(const c of cases){
 assert.equal(c.patient.name,'Practice Patient');assert.equal(c.patient.dob,'01/01/1950');
 assert.equal(c.patient.room,'Sim Bed 1');assert.equal(c.patient.age,76);
}
const context={window:{}};vm.runInNewContext(read('data.js'),context);
assert.equal(JSON.stringify(context.window.MAR_CASES),JSON.stringify(cases));
const app=read('app.js');
// Evaluate the actual drug reference definitions used by the app, not a parallel
// hand-maintained list. The release test exercises every trade alias automatically.
const refDefinition=app.match(/^const REF=(\{[\s\S]*?\});\nconst portrait=/m);
assert(refDefinition,'Cannot extract live medication reference definitions');
const references=vm.runInNewContext('('+refDefinition[1]+')');
const tradeNames=Object.values(references).flatMap(ref=>[
 ref.trade,...(ref.trade||'').split('/').map(name=>name.trim())
].filter(Boolean));
const vocabulary=[...new Set([
 ...Object.keys(references),
 ...tradeNames,
 ...cases.flatMap(c=>c.meds.flatMap(m=>[m.name,m.original].filter(Boolean)))
])];
assert(app.includes('...Object.values(REF).flatMap(entry=>['),'All trade names must be derived dynamically from REF');
assert(app.includes("...(entry.trade||'').split('/').map(name=>name.trim())"),'Slash separated trade names must be included');

assert(app.includes("caseKey:'MAR1',mode:'checkoff'"),'Checkoff must be default mode');
assert(app.includes('2026 to 2027 US formulation is trivalent Fluzone'),'Vaccine label note missing');
const fragment=app.split('function expected(m,s){')[1].split('const anticipatedSyringe=')[0];
const expected=new Function('m','s',fragment.slice(0,fragment.lastIndexOf('}')));
for(const [order,strength,volume] of [
 ['Now 5,000 units Subcutaneous Once','50,000 Units/5 mL (10,000 units/mL)',0.5],
 ['Now 200 Units Subcutaneous Once','10,000 USP/10 mL (1,000 U/mL)',0.2],
 ['Now 5,000 units Subcutaneous Once','10,000 U/10 mL (1,000 U/mL)',5]
])assert.equal(expected({name:'Heparin',order,strength},{}).volume,volume);
const {match,dizzinessResponse,medicationReply}=require('./dialog_engine.js');
for(const [recipient,stage,prompt,intent] of [
 ['patient',3,'What is your full name?','name'],['patient',3,'What is your date of birth?','dob'],
 ['patient',3,'Do you have any drug allergies?','allergies'],['patient',3,'Can you swallow pills?','swallow'],
 ['patient',3,'Are you Jane Doe?','wrongName'],['patient',3,'Can I get you some water?','water'],
 ['patient',3,'What is your pain score?','pain'],['patient',3,'Which injection site would you prefer?','preference'],
 ['instructor',3,'What is the blood pressure and pulse?','assess'],
 ['instructor',1,'Please clarify the missing NPH dose','clarify'],
 ['instructor',2,'What is the mechanism of action?','mechanism'],
 ['patient',3,'Are we watching the geese outside?','unknown']
 ])assert.equal(match(recipient,stage,prompt),intent,`Incorrect keyword intent for ${prompt}`);
// Regression: common symptom questions must NEVER be logged as wrong patient identifiers.
for(const [prompt,intent] of [
 ['Are you having any pain?','pain'],
 ['Are you feeling dizzy when you stand?','dizziness'],
 ['Are you allergic to any medicines?','allergies'],
 ['Are you in pain?','pain'],
 ['Are you having pain?','pain'],
 ['You are feeling dizzy.','dizziness'],
 ['Are you Practice Patient?','name'],
 ['Is your name Practice Patient?','name'],
 ['Your name is Practice Patient.','name'],
 ['Are you Mr. Smith?','wrongName'],
 ['Are you Jane Doe?','wrongName'],
 ['Are you Taking Warfarin?','medications'],
 ['Are you taking Furosemide?','medications'],
 ['Are you on any blood thinners?','medications'],
 ['Are you taking any medicines?','medications'],
 ['Are you taking any other medicines?','medications'],
 ['Are you taking Tylenol?','medications'],
 ['Are you taking Lasix?','medications'],
 ['Are you taking Coumadin?','medications'],
 ['Are you taking Jantoven?','medications'],
 ['Are you taking Percocet?','medications'],
 ['Are you taking Benadryl?','medications'],
 ['Are you taking Colace?','medications'],
 ['Are you taking Humulin R?','medications'],
 ['Are you taking Novolin N?','medications'],
 ['Are you taking some other medications?','medications'],
 ['Are you using any other meds?','medications'],
 ['What medications do you take at home?','medications'],
 ['Your name is Jane Doe.','wrongName'],
 ['You are Jane Doe.','wrongName']
]){
 const actual=match('patient',3,prompt,vocabulary);
 assert.equal(actual,intent,`Wrong bedside classification for ${JSON.stringify(prompt)}`);
 if(intent!=='wrongName')assert.notEqual(actual,'wrongName',`False patient identity mismatch: ${prompt}`);
}
// Case aware symptoms: the furosemide hold scenario explicitly reports dizziness.
const furosemideAssessments=app.match(/'Furosemide':\['([^']+)','([^']+)'\]/);
assert(furosemideAssessments,'The app must provide both furosemide assessment scenarios');
assert.match(furosemideAssessments[2],/84\/48/);
assert.match(furosemideAssessments[2],/dizzy/i);
assert.equal(dizzinessResponse(furosemideAssessments[2]).dizziness,'Yes');
assert.match(dizzinessResponse(furosemideAssessments[2]).text,/yes.*dizzy/i);
assert.doesNotMatch(dizzinessResponse(furosemideAssessments[2]).text,/no,? i do not feel dizzy/i);
assert.equal(dizzinessResponse(furosemideAssessments[1]).dizziness,'No');
assert.equal(dizzinessResponse(furosemideAssessments[1],'Yes').dizziness,'Yes','Previously reported symptoms must persist');
assert(app.includes('window.MedPassDialogue.dizzinessResponse(findings,s.patientState.dizziness)'), 'App must pass current risk findings to patient reply');
assert(app.includes("if(/\\b(?:dizzy|dizziness|lightheaded|vertigo)\\b/i.test(t))v.dizziness='Yes'"),'Proctor findings must update displayed symptom state');
// Medication-history answers may mention MAR orders, but must not mistake them for a full home med list.
const anticoagReply=medicationReply(cases[0].meds,'Are you on any blood thinners?');
assert.match(anticoagReply,/heparin/i);
assert.match(anticoagReply,/home|complete medication history/i);
const otherReply=medicationReply(cases[1].meds,'Are you on any blood thinners?');
assert.match(otherReply,/not sure|verify/i);
assert.doesNotMatch(otherReply,/I do not take any blood thinners/i);
const namedReply=medicationReply(cases[0].meds,'Are you Taking Warfarin?',references);
assert.match(namedReply,/warfarin/i);
assert.match(namedReply,/not (?:a )?complete|cannot confirm|check my medication history/i);
// Test the aliases against reference entries and confirm order versus home history.
for(const [generic,brand] of [
 ['Acetaminophen','Tylenol'], ['Furosemide','Lasix'],
 ['Warfarin','Coumadin'],['Warfarin','Jantoven'],
 ['Oxycodone/acetaminophen','Percocet'],
 ['Diphenhydramine','Benadryl'],['Docusate sodium','Colace'],
 ['Regular insulin U100','Humulin R'],['NPH insulin U100','Novolin N']
]){
 assert(vocabulary.includes(brand),`${brand} missing from app vocabulary`);
 assert.equal(match('patient',3,`Are you taking ${brand}?`,vocabulary),'medications');
 const answer=medicationReply([{name:generic}],`Are you taking ${brand}?`,references);
 assert(answer.includes(generic),`Brand ${brand} must resolve to the generic order: ${answer}`);
 assert.match(answer,/home medication list|home medication|medication history/i);
}
const tylenolInMAR1=medicationReply(cases[0].meds,'Are you taking Tylenol?',references);
assert.match(tylenolInMAR1,/Acetaminophen.*order due/i);
const unknownCoumadin=medicationReply(cases[0].meds,'Are you taking Coumadin?',references);
assert.match(unknownCoumadin,/cannot confirm.*Warfarin.*home/i);
assert.equal(match('patient',3,'Are you Taking Sodium Chloride?',['Simulation sodium chloride']),'medications');
// Future medications must be recognized from case data without editing identityIntent.
const futureDrug=[{name:'Quendorin Citrate'}];
assert.equal(match('patient',3,'Are you Quendorin Citrate?',futureDrug),'medications');
assert.equal(match('patient',3,'Are you taking Quendorin Citrate?',futureDrug),'medications');
assert.equal(match('patient',3,'Are you Jane Doe?',futureDrug),'wrongName');
assert(app.includes('const MEDICATION_VOCABULARY=[...new Set('),'Medication vocabulary must be derived automatically');
assert(app.includes('...CATALOG.flatMap(item=>item.case.meds.flatMap(m=>[m.name,m.original].filter(Boolean)))'));
assert(app.includes('window.MedPassDialogue.match(role,s.stage,cleaned,MEDICATION_VOCABULARY)'));
const identitySource=read('dialog_engine.js').split('const clinicalWords=')[1].split('const caseDrugWord=')[0];
assert(!/warfarin|coumadin|heparin|aspirin|furosemide/i.test(identitySource),'Drug names should not be hardcoded in patient name exclusion list');
assert(app.includes('window.MedPassDialogue.medicationReply(s.c.meds,cleaned,REF)'), 'App must answer medication history questions from case orders');
// Fallback speech must be spoken by the selected recipient, never the other role.
const {fallback}=require('./dialog_engine.js');
assert.equal(fallback('instructor').by,'instructor','Unknown instructor question must get instructor reply');
assert.equal(fallback('patient').by,'patient','Unknown patient question must get patient reply');
assert.match(fallback('instructor').text,/vitals|labs/i);
assert.match(fallback('patient').text,/name|allergies/i);
assert(app.includes('window.MedPassDialogue.fallback(role)'), 'Replies must use recipient selected in Speak to');
assert(app.includes('role="log" aria-live="polite"'),'Dialogue must be a live region');
assert(read('index.html').includes('id="dialogue-announcement"'),'Persistent announcer must be present');
assert(app.includes('function guidedPrepScreen(s,m)'), 'Guided injection preparation missing');
assert(app.includes("prepLayout:'guided'"), 'Guided prep must be the default');
assert(app.includes('data-act=\"prepView\"'), 'Advanced full checklist toggle missing');
assert(app.includes('data-act=\"nextMed\"'), 'Next medication progression missing');
assert(app.includes('function prepNextAction(s,m)'), 'Full checklist fallback missing');
assert(app.includes('class=\"prepFeedback\"'), 'Rejected drawing steps must show inline feedback');
assert(read('styles.css').includes('.prepHelp'), 'Prep guide styling missing');
assert(app.includes('function updateVitals(s,m)'),'Visible patient vitals must update');
assert(app.includes('function typedDialogue(role,text)'),'Free text interaction missing');
assert(!/👩🏻‍🦳/.test(app),'Do not use platform specific emoji for patient');
assert(read('README.md').includes('confirmed with their instructor and college'),'Publication status outdated');
const sw=read('sw.js');
assert(/medpass-lab-v9-[0-9a-f]{12}/.test(sw),'Service worker must use versioned content hash');
assert(sw.includes('dialog_engine.js'),'Offline cache must include dialogue engine');
assert(sw.includes("fetch(event.request,{cache:'no-store'})"));
assert(sw.includes('key.startsWith(PREFIX)'));
assert(read('N1009_MedPass_Lab.html').includes('id="dialogue-announcement"'));
// Inline output must preserve JavaScript replacement tokens literally.
// Otherwise String.replace treats "$&" inside an embedded script as a placeholder.
assert(read('N1009_MedPass_Lab.html').includes("replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')"), 'Inline script was changed during HTML generation');
assert(!read('N1009_MedPass_Lab.html').includes("'\\<script src=\"dialog_engine.js\"></script>"), 'Inline JS contains a corrupted string replacement');

execFileSync(process.execPath,[path.join(root,'build.js'),'--check'],{stdio:'pipe'});
// Core source, safety, dialogue and build checks require Node only. Real browser
// tests are opt in for development, and mandatory for packaging a release.
const browserFile='dialogue_browser.py';
assert(read(browserFile).includes("os.environ.get('CHROMIUM_PATH')"),'Browser path override missing');
assert(!read(browserFile).includes('/usr/bin/chromium'),'Browser path must not be hard coded');
assert(read(browserFile).includes("start(page, 'MAR1')"),'Missing EMAR browser coverage');
if(process.argv.includes('--browser')){
 console.log('Core v9 assertions passed. Running required Chromium browser checks...');
 try{
  execFileSync(process.env.PYTHON || 'python3',[path.join(root,browserFile)],{cwd:root,stdio:'inherit',timeout:120000});
 }catch(error){
  console.error('Browser integration tests failed or cannot start. Full release requires Python 3, Python Playwright and Chromium.');
  console.error('Install: python3 -m pip install playwright && python3 -m playwright install chromium');
  console.error('Optional: set PYTHON to your Python interpreter and CHROMIUM_PATH to your Chromium executable.');
  process.exit(1);
 }
 console.log('All v9 checks passed, including real Chromium bedside interactions.');
}else{
 console.log('All v9 core release assertions passed (Node only). For complete browser verification: node test_release.js --browser');
}
