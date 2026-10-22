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
            rights(page, 1)
            page.locator('[data-input="syringe"]').select_option('tuberculin')
            page.locator('[data-input="amount"]').fill('0.2')
            page.locator('[data-input="air"]').fill('0.2')
            page.locator('[data-input="initials"]').fill('ST')
            page.locator('[data-input="credentials"]').fill('SN')
            for name in ('chooseSyringe', 'labelWritten', 'vialClean', 'injectAir',
                         'withdraw', 'clearBubbles', 'sterile', 'labelAttached'):
                step(page, name)
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


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = launch_browser(p)
        try:
            check_furosemide(browser)
            check_emar(browser)
        finally:
            browser.close()
