"""MedPass Lab browser integration checks.

Run python dialogue_browser.py or node test_release.js --browser.
The release packager always requires this suite. Requires Playwright for
Python and a Chromium browser. CHROMIUM_PATH overrides browser discovery.
"""
import os
from pathlib import Path
from shutil import which
from playwright.sync_api import sync_playwright

HTML = Path(__file__).with_name('N1009_MedPass_Lab.html').read_text(encoding='utf-8')


def launch_browser(playwright):
    explicit = os.environ.get('CHROMIUM_PATH')
    if explicit and not Path(explicit).is_file():
        raise RuntimeError(f'CHROMIUM_PATH is not a file: {explicit}')
    discovered = explicit or which('chromium') or which('chromium-browser') or which('google-chrome')
    options = {'headless': True, 'args': ['--no-sandbox', '--no-proxy-server', '--disable-extensions']}
    if discovered:
        options['executable_path'] = discovered
    return playwright.chromium.launch(**options)


def step(page, step_id):
    page.locator(f'[data-act="step"][data-id="{step_id}"]').first.click()


def rights(page, number):
    for value in ('patient', 'drug', 'dose', 'time', 'route', 'documentation'):
        step(page, f'r{number}_{value}')


def speak(page, message, recipient='patient'):
    page.locator('#chat-recipient').select_option(recipient)
    page.locator('#chat-message').fill(message)
    page.locator('#chat-form button[type="submit"]').click()
    return page.locator('.dialogue .bubble').last.inner_text()


def start(page, scenario, challenge=False):
    page.locator('#case').select_option(scenario)
    if challenge:
        page.locator('[data-input="challenge"]').check()
    page.locator('[data-act="start"]').click()


def bedside_furosemide(page, challenge):
    start(page, 'DRILL1', challenge)
    for item in ('uniform', 'peers', 'hygiene1', 'marAllergies', 'gather', 'expiry', 'keepPackaged'):
        step(page, item)
    page.locator('[data-input="amount"]').fill('1')
    rights(page, 1)
    step(page, 'oralCount')
    page.locator('[data-act="nextStage"]').click()
    rights(page, 2)
    page.locator('[data-act="answerQuiz"][data-index="1"]').click()
    step(page, 'hygiene2')
    page.locator('[data-act="nextStage"]').click()
    assert '03 · Patient bedside' in page.locator('body').inner_text()


def bedside_emar1(page):
    # An actual three-drug workbook scenario, not a focused one-drug drill.
    # Oral Docusate and Acetaminophen plus injectable Heparin.
    start(page, 'MAR1')
    assert [x.strip() for x in page.locator('.marDrug .drugTitle').all_inner_texts()] == [
        'Docusate sodium', 'Acetaminophen', 'Heparin'
    ]
    for item in ('uniform', 'peers', 'hygiene1', 'marAllergies'):
        step(page, item)
    for index in (0, 1, 2):
        page.locator('.marDrug').nth(index).click()
        step(page, 'gather')
        step(page, 'expiry')
        if index < 2:
            step(page, 'keepPackaged')
            page.locator('[data-input="amount"]').fill('1')
            rights(page, 1)
            step(page, 'oralCount')
        else:
            # In guided mode there is just one required action and no early draw button.
            assert page.locator('#guided-current-step').is_visible()
            assert page.locator('[data-act="step"][data-id="withdraw"]').count() == 0
            # The classic checklist is still accessible, and its original safety
            # validation continues to reject premature withdrawal.
            page.locator('[data-act="prepView"][data-value="all"]').click()
            step(page, 'withdraw')
            warning = page.locator('.prepFeedback').inner_text()
            assert 'first six rights' in warning, warning
            page.locator('[data-act="prepView"][data-value="guided"]').click()
            rights(page, 1)
            assert 'Choose and confirm your syringe' in page.locator('#guided-task-title').inner_text()
            page.locator('[data-input="syringe"]').select_option('tuberculin')
            step(page, 'chooseSyringe')
            assert 'Prepare the syringe label' in page.locator('#guided-task-title').inner_text()
            page.locator('[data-input="amount"]').fill('0.2')
            page.locator('[data-input="initials"]').fill('ST')
            page.locator('[data-input="credentials"]').fill('SN')
            step(page, 'labelWritten')
            step(page, 'vialClean')
            assert 'Air volume to inject' in page.locator('#guided-current-step').inner_text()
            page.locator('[data-input="air"]').fill('0.2')
            step(page, 'injectAir')
            assert 'Measured medication amount' in page.locator('#guided-current-step').inner_text()
            step(page, 'withdraw')
            for name in ('clearBubbles', 'sterile', 'labelAttached'):
                step(page, name)
            assert 'ready for instructor verification' in page.locator('#guided-current-step').inner_text()
    page.locator('[data-act="nextStage"]').click()
    assert '02 · Instructor check' in page.locator('body').inner_text(), 'Could not advance eMAR 1 to instructor'
    for index in (0, 1, 2):
        page.locator('.marDrug').nth(index).click()
        rights(page, 2)
        page.locator('[data-act="answerQuiz"][data-index="0"]').click()
    step(page, 'hygiene2')
    page.locator('[data-act="nextStage"]').click()
    assert '03 · Patient bedside' in page.locator('body').inner_text(), 'Could not advance eMAR 1 to bedside'


def check_furosemide(browser):
    for risk, bp, dizzy in ((True, '84/48', 'Yes'), (False, '134/78', 'No')):
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(HTML)
        bedside_furosemide(page, risk)
        text = speak(page, 'Are you feeling dizzy when you stand?')
        assert ('Yes, I feel dizzy' if risk else 'No, I have not noticed dizziness') in text, text
        assert f'DIZZINESS\n{dizzy}' in page.locator('.statusCard').inner_text()
        for question in ('Are you Taking Warfarin?', 'Are you on any blood thinners?',
                         'Are you taking any other medicines?'):
            reply = speak(page, question)
            assert 'medication' in reply.lower() or 'medicine' in reply.lower() or 'blood thinner' in reply.lower(), (question, reply)
            assert 'not my name' not in reply.lower(), (question, reply)
        brand_reply=speak(page,'Are you taking Lasix?')
        assert 'Furosemide' in brand_reply and 'order due' in brand_reply,brand_reply
        assert 'not my name' not in brand_reply.lower(),brand_reply
        speak(page, 'Can I have blood pressure and potassium?', 'instructor')
        state = page.locator('.statusCard').inner_text()
        assert bp in state, state
        assert f'DIZZINESS\n{dizzy}' in state
        assert not errors, errors
        print(f'PASS furosemide challenge={risk}: {bp}, dizziness={dizzy}, dialogue consistent', flush=True)
        page.close()


def check_emar(browser):
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(HTML)
    bedside_emar1(page)
    question = 'Are you taking any other medicines?'
    answer = speak(page, question)
    assert 'home' in answer.lower() or 'medication history' in answer.lower(), (question, answer)
    assert 'not my name' not in answer.lower()
    for brand, generic in [('Tylenol','Acetaminophen'),('Colace','Docusate sodium')]:
        answer = speak(page, f'Are you taking {brand}?')
        assert generic in answer and 'order due' in answer, (brand, answer)
        assert 'not my name' not in answer.lower(), answer
    answer = speak(page,'Are you taking Coumadin?')
    assert 'Warfarin' in answer and 'cannot confirm' in answer, answer
    answer = speak(page, 'Are you Taking Heparin?')
    assert 'Heparin' in answer, answer
    assert 'not my name' not in answer.lower(), answer
    answer = speak(page, 'Are you Practice Patient?')
    assert 'Practice Patient' in answer and 'not my name' not in answer, answer
    # Test unmatched instructor dialogue in the rendered chat, not just in JS.
    answer = speak(page, 'Could you recite a nursery rhyme about the moon?', 'instructor')
    assert 'INSTRUCTOR' in answer.upper() and 'not sure' in answer.lower(), answer
    assert not errors, errors
    print('PASS EMAR 1: Docusate, Acetaminophen and Heparin; trade aliases, medication intent, name and instructor fallback', flush=True)
    page.close()


def check_guided_injections(browser):
    # NPH clarification and simulated IM preparation with the remaining eMAR still pending.
    for scenario, medication, syringe, amount, air, needle in (
        ('MAR13', 'NPH insulin U100', 'insulin', '12', '0.12', None),
        ('MAR6', 'Simulation sodium chloride', '3mL', '2', '2', '1 inch'),
    ):
        page = browser.new_page(viewport={'width':390, 'height':844})
        page.set_default_timeout(8000)
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(HTML)
        start(page, scenario)
        page.locator('.marDrug').nth(2).click()
        assert medication in page.locator('.guidedOrder').inner_text()
        above = page.evaluate("document.querySelector('.workspace > main').getBoundingClientRect().top < document.querySelector('.workspace > .rightPanel').getBoundingClientRect().top")
        assert above, 'Guided workbench must appear above the conversation on mobile'
        for item in ('uniform','peers','hygiene1','marAllergies','gather','expiry'):
            step(page,item)
        rights(page,1)
        page.locator('[data-input="syringe"]').select_option(syringe)
        if needle:
            page.locator('[data-input="needle"]').select_option(needle)
        step(page,'chooseSyringe')
        if medication.startswith('NPH'):
            assert 'Clarify' in page.locator('#guided-task-title').inner_text()
            page.locator('#guided-current-step [data-act="clarify"]').click()
            step(page,'rollNPH')
        page.locator('[data-input="amount"]').fill(amount)
        page.locator('[data-input="initials"]').fill('ST')
        page.locator('[data-input="credentials"]').fill('SN')
        step(page,'labelWritten')
        step(page,'vialClean')
        page.locator('[data-input="air"]').fill(air)
        step(page,'injectAir')
        step(page,'withdraw')
        step(page,'clearBubbles')
        step(page,'sterile')
        label=page.locator('.labelPreview').inner_text()
        assert 'Date:' in label and '24h:' in label and 'ST, SN' in label,label
        step(page,'labelAttached')
        assert 'ready for instructor verification' in page.locator('#guided-current-step').inner_text()
        assert page.locator('[data-act="nextMed"]').count()==1
        page.locator('[data-act="nextMed"]').click()
        assert not errors,errors
        print(f'PASS guided {scenario}: {medication}, label and next medication',flush=True)
        page.close()

def check_safe_aftercare(browser):
    # Full subcutaneous heparin drill. Verify that avoiding massage succeeds
    # and that the student is never offered a tempting "massage" failure button.
    page = browser.new_page(viewport={'width':390, 'height':844})
    page.set_default_timeout(8000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(HTML)
    start(page,'DRILL10')
    for id in ('uniform','peers','hygiene1','marAllergies','gather','expiry'):
        step(page,id)
    rights(page,1)
    page.locator('[data-input="syringe"]').select_option('tuberculin')
    step(page,'chooseSyringe')
    page.locator('[data-input="amount"]').fill('0.2')
    page.locator('[data-input="initials"]').fill('ST')
    page.locator('[data-input="credentials"]').fill('SN')
    step(page,'labelWritten')
    step(page,'vialClean')
    page.locator('[data-input="air"]').fill('0.2')
    for id in ('injectAir','withdraw','clearBubbles','sterile','labelAttached'):
        step(page,id)
    page.locator('[data-act="nextStage"]').click()
    rights(page,2)
    page.locator('[data-act="answerQuiz"][data-index="0"]').click()
    step(page,'hygiene2')
    page.locator('[data-act="nextStage"]').click()
    for id in ('hygiene3','introduce','patientName','patientDOB','band','allergies'):
        step(page,id)
    page.locator('[data-act="assess"]').first.click()
    page.locator('[data-act="decision"][data-value="give"]').click()
    rights(page,3)
    for id in ('teach','syringeVerify','landmarks','preference'):
        step(page,id)
    page.locator('[data-input="site"]').select_option('Abdomen')
    for id in ('gloves','wipeOpen','siteClean','bunch','warnPoke','angle'):
        step(page,id)
    page.locator('[data-act="administer"]').click()
    assert page.locator('[data-act="step"][data-id="blot"]').count()==1
    assert page.locator('[data-act="massage"]').count()==0
    assert 'Do NOT massage the injection site.' in page.locator('.workspace').inner_text()
    step(page,'blot')
    assert 'done' not in (page.locator('[data-id="blot"]').first.get_attribute('class') or '').split()
    assert 'needle withdrawal' in page.locator('body').inner_text().lower()
    for id in ('hold10','releaseBunch','sharpSafe','blot','shred'):
        step(page,id)
    assert 'Aftercare: 5 of 5 complete' in page.locator('body').inner_text()
    step(page,'document')
    for id in ('trash','hygiene4'):
        step(page,id)
    page.locator('[data-act="nextStage"]').click()
    assert page.locator('.score').inner_text()=='S','No-massage safe path must be satisfactory'
    assert 'massag' not in '\n'.join(page.locator('.critical').all_inner_texts()).lower()
    assert not errors,errors
    print('PASS heparin aftercare: no massage, guided blot, satisfactory report', flush=True)
    page.close()


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = launch_browser(p)
        try:
            check_furosemide(browser)
            check_emar(browser)
            check_guided_injections(browser)
            check_safe_aftercare(browser)
        finally:
            browser.close()
