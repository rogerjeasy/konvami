(() => {
  // Replaced by the server with the page's messages in its language, and the two addresses.
  const messages = __MESSAGES__;
  const askPath = __ASK_PATH__;
  const confirmPath = __CONFIRM_PATH__;

  // Everything shown goes through `textContent`, so no text is ever read as markup.
  const $ = (id) => document.getElementById(id);
  const note = $('status');

  function say(text, bad) {
    note.textContent = text;
    note.dataset.bad = bad ? '1' : '';
  }

  function show(id) {
    for (const section of document.querySelectorAll('main > section')) {
      section.hidden = section.id !== id;
    }
  }

  // Resolves when the request went through; otherwise throws the error code to show.
  async function post(path, body) {
    let response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw 'network';
    }
    if (response.ok) return;
    let code = 'unavailable';
    try {
      code = (await response.json()).error.code;
    } catch {
      // An answer that is not ours: the general message is the right one.
    }
    throw code;
  }

  // Runs one request with its button locked, so it is never sent twice.
  async function submit(form, work) {
    const button = form.querySelector('button');
    button.disabled = true;
    say('', false);
    try {
      await work();
    } catch (code) {
      say(messages[code] || messages.unavailable, true);
    }
    button.disabled = false;
  }

  $('ask').addEventListener('submit', (event) => {
    event.preventDefault();
    submit(event.target, async () => {
      await post(askPath, { email: $('email').value });
      show('verify');
      say(messages.sent, false);
      $('code').focus();
    });
  });

  $('verify-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submit(event.target, async () => {
      await post(confirmPath, { email: $('email').value, code: $('code').value });
      show('done');
      say(messages.done, false);
    });
  });
})();
