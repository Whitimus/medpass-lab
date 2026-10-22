/* Rule based, fully offline language matching for fictional practice dialogue.
   Keywords are prompts only, not clinical proof or real speech recognition. */
(function(root,factory){
  const value=factory();
  if(typeof module==='object'&&module.exports) module.exports=value;
  if(root)root.MedPassDialogue=value;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 // Only explicit patient-name confirmations should reach the mismatch log.
 // Requiring a plausible personal name avoids confusing assessments ("are you dizzy?")
 // with an identification check.
 const identityIntent=(raw,medications=[])=>{
   const phrase=String(raw||'').trim().match(/^(are you|you are|your name is|is your name|am i speaking (?:to|with))\s+(.+?)\s*[?!]*$/i);
   if(!phrase)return null;
   const lead=phrase[1].toLowerCase();
   const candidate=phrase[2].trim().replace(/[.?!]+$/,'').trim();
   const normalized=candidate.toLowerCase().replace(/\s+/g,' ');
   if(normalized==='practice patient')return 'name';
   // Title case alone is not evidence of a person's name. Exclude clinical
   // verbs, symptoms, drug names and the medications known to this scenario.
   // Exclude assessment language, not hand-maintained medication names. The caller
   // supplies the medication vocabulary generated from current cases and references.
   const clinicalWords=/\b(?:having|feeling|taking|using|receiving|getting|experiencing|allergic|dizzy|dizziness|lightheaded|pain|medicine|medication|medicines|medications|blood|thinner|side|effects|breathing|standing|hungry|thirsty|sleepy|awake|confused|nauseated|allergies|hurt|sick|better|okay|fine)\b/i;
   const caseDrugWord=medications.some(m=>{
     const words=String(typeof m==='string'?m:m.name||'').toLowerCase().match(/[a-z]{4,}/g)||[];
     return words.some(w=>new RegExp('\\b'+w+'\\b','i').test(candidate));
   });
   if(clinicalWords.test(candidate)||caseDrugWord)return null;
   const honorific=/^(?:mr|mrs|ms|miss|dr)\.?\s+[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?$/i.test(candidate);
   const capitalizedName=/^[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){1,2}$/.test(candidate);
   const explicitName=(lead==='your name is'||lead==='is your name') &&
     /^[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){1,2}$/i.test(candidate) &&
     !/\b(?:having|feeling|allergic|taking|in|on|pain|dizzy|tired|sleepy|okay|fine|better|sick|breathing|going|doing|getting|experiencing|need|needing|hungry|thirsty)\b/i.test(candidate);
   return honorific||capitalizedName||explicitName?'wrongName':null;
 };
 const dizzinessResponse=(assessment='',prior=null)=>{
   const symptomatic=/\b(?:dizzy|dizziness|lightheaded|vertigo)\b/i.test(String(assessment||''))||prior==='Yes';
   return symptomatic
     ?{dizziness:'Yes',text:'Yes, I feel dizzy right now. I do not feel safe getting up without help.'}
     :{dizziness:'No',text:'No, I have not noticed dizziness right now. I would still like help before standing.'};
 };
 const medicationReply=(medications=[],raw='',references={})=>{
   const names=(Array.isArray(medications)?medications:[]).map(m=>typeof m==='string'?m:m.name||'').filter(Boolean);
   const question=String(raw||'').toLowerCase();
   // Resolve generic and trade names through the same reference data as the UI.
   // A current MAR order is not proof that a patient takes the drug at home.
   const escapePattern=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const mentions=alias=>alias&&new RegExp('(?:^|[^a-z0-9])'+escapePattern(alias.toLowerCase())+'(?=$|[^a-z0-9])').test(question);
   const aliases=name=>[name,...(references[name]?.trade||'').split('/').map(value=>value.trim())].filter(Boolean);
   if(/\b(?:blood\s*thinners?|anticoagulants?|antiplatelets?)\b/.test(question)){
     const anticoagulants=names.filter(name=>/^(?:heparin|warfarin)$/i.test(name));
     const antiplatelets=names.filter(name=>/^aspirin$/i.test(name));
     if(anticoagulants.length)return `I see ${anticoagulants.join(' and ')} on today's medication orders. I am not sure about all the medications I take at home. Please verify my complete medication history.`;
     if(antiplatelets.length)return "Aspirin is on today's medication orders, but I am not sure about any other blood thinning medicines at home. Please check my complete medication history.";
     return "I am not sure if I take blood thinners at home. Please verify my complete medication history, since today's orders might not show all of it.";
   }
   const ordered=names.find(name=>aliases(name).some(mentions));
   const referenced=Object.keys(references).find(name=>aliases(name).some(mentions));
   if(ordered)return `${ordered} is listed as an order due in this practice case. I am not sure about my full home medication list. Please verify it before giving any medication.`;
   if(referenced)return `I cannot confirm whether I take ${referenced} at home. Please check my medication history; the orders due now are not a complete medication list.`;
   return 'I am not sure of every medicine I take at home. Please check my complete medication history and compare it with the current orders.';
 };
 const fallback=role=>role==='instructor'
   ?{by:'instructor',text:'I am not sure how to answer that phrasing. Try asking for vitals, labs, mechanism, adverse effects, dosage verification, or order clarification.'}
   :{by:'patient',text:'I am not sure how to answer that. Could you ask another way? You can ask about my name, birth date, allergies, swallowing, symptoms or preferences.'};
 const match=(role,stage,raw,medications=[])=>{
   const text=String(raw||'').trim().toLowerCase().replace(/\s+/g,' ');
   if(!text)return 'empty';
   if(role==='instructor'){
     if(/(clarif|confirm|incomplete order|missing.*(dose|scale)|nph.*(units|scale)|prescrib)/.test(text))return 'clarify';
     if(/(assess|vital|blood pressure|\bbp\b|heart rate|\bhr\b|pulse|respir|\brr\b|oxygen|spo2|saturation|glucose|blood sugar|\bbg\b|pain score|alertness|level of consciousness|\blab|inr|potassium|platelet)/.test(text))return 'assess';
     if(/(mechanism|how does.*work|pharmacolog|drug class)/.test(text))return 'mechanism';
     if(/(adverse|side effect|contraindic|risk|precaution)/.test(text))return 'adverse';
     if(/(syringe|dose|volume|how much|units|calculation|mg\/ml)/.test(text))return 'dose';
     if(/(why|purpose|indication|what.*for)/.test(text))return 'indication';
     return 'unknown';
   }
   if(stage!==3)return 'notbedside';
   if(/\b(?:i am|i'm|we are)\s+(?:going to )?(?:give|giving|administer|administering)\b|\b(?:this medication|this medicine) (?:will|is used|helps|treats)\b/.test(text))return 'teach';
   const identity=identityIntent(raw,medications);
   if(identity)return identity;
   if(/(your|tell me|state|confirm|what is|what's|full|say).{0,35}(name)|\bwho are you\b|\bname and (?:date of birth|dob)\b/.test(text))return 'name';
   if(/(date of birth|birth date|birthday|\bdob\b|when were you born)/.test(text))return 'dob';
   if(/(allerg|reaction to medicine|any medications you can't take)/.test(text))return 'allergies';
   const currentDrug=medications.some(m=>{
     const tokens=String(typeof m==='string'?m:m.name||'').toLowerCase().match(/[a-z]{4,}/g)||[];
     return tokens.some(token=>new RegExp('\\b'+token+'\\b').test(text));
   });
   if(/\b(?:blood\s*thinners?|anticoagulants?|antiplatelets?|medication history|medication list|home medications?|home meds|what (?:medications?|medicines?|meds) do you|which (?:medications?|medicines?|meds)|what (?:medications?|medicines?|meds) are you|(?:taking|take|on|prescribed|receiving|using)\s+(?:(?:any|some)\s+)?(?:other\s+)?(?:medications?|medicines?|meds))\b/.test(text)
     || currentDrug)return 'medications';
   if(/(swallow|chok|difficulty.*(pill|eat|drink)|trouble.*(pill|eat|drink))/.test(text))return 'swallow';
   if(/(one at a time|all together|pill.*pref|take.*(pills|tablets|capsules)|pills.*together)/.test(text))return 'oralChoice';
   if(/(where.*(injection|shot)|prefer.*(site|shot|injection)|which.*(arm|leg|abdomen|site)|injection site)/.test(text))return 'preference';
   if(/(how.*pain|pain (?:score|level)|rate.*pain|how.*hurt|pain.*(better|worse)|pain.*\b10\b|\b(?:any|have|having|in|much|experiencing|feel|feeling)\s+pain\b|\bdoes (?:it|that) hurt\b)/.test(text))return 'pain';
   if(/(\bdizz(?:y|iness)\b|\blightheaded\b|\bvertigo\b)/.test(text))return 'dizziness';
   if(/(alert|sleepy|drowsy|awake|how.*feeling|feel okay|feel now)/.test(text))return 'feel';
   if(/(water|drink|thirst|dry mouth)/.test(text))return 'water';
   if(/(side effect|adverse|dizz|nausea|bleed|sleepy|constipat|diarrhea|rash)/.test(text))return 'effects';
   if(/(explain|i am giving|this medication|this medicine|\bmedication\b|\bmedicine\b|the purpose|what.*for)/.test(text))return 'teach';
   if(/(bracelet|wristband|armband|identity band|id band)/.test(text))return 'band';
   if(/(hello|hi |good morning|good afternoon|i'm your|i am your|my name is)/.test(text))return 'introduce';
   return 'unknown';
 };
 return {match,fallback,identityIntent,dizzinessResponse,medicationReply};
});
