const fieldDefinitions = [
  ["sifra_uplate", "Šifra uplate"],
  ["iznos", "Iznos"],
  ["svrha_uplate", "Svrha uplate"],
  ["racun_primaoca", "Račun primaoca"],
  ["model", "Model"],
  ["poziv_na_broj", "Poziv na broj"],
  ["primalac_naziv", "Primalac - naziv"],
  ["primalac_adresa", "Primalac - adresa"],
  ["primalac_mesto", "Primalac - mesto"],
];

const newTemplateButton = document.querySelector("#new-template-button");
const cancelButton = document.querySelector("#cancel-button");
const templateForm = document.querySelector("#template-form");
const templateFields = document.querySelector("#template-fields");
const templateName = document.querySelector("#template-name");
const templateList = document.querySelector("#template-list");
const emptyState = document.querySelector("#empty-state");
const formStatus = document.querySelector("#form-status");
const pageStatus = document.querySelector("#page-status");
const targetTabId = Number(
  new URLSearchParams(window.location.search).get("targetTabId"),
);

function setFormStatus(message, isError = false) {
  formStatus.textContent = message;
  formStatus.classList.toggle("error", isError);
}

function setPageStatus(message, isError = false) {
  pageStatus.textContent = message;
  pageStatus.classList.toggle("error", isError);
}

function createField([key, label]) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.name = key;
  input.type = key === "iznos" ? "number" : "text";
  input.step = key === "iznos" ? "0.01" : "";
  wrapper.append(input);
  return wrapper;
}

function renderFields() {
  templateFields.replaceChildren(...fieldDefinitions.map(createField));
}

async function getTemplates() {
  const result = await chrome.storage.local.get({ templates: [] });
  const payerFields = new Set([
    "uplatilac_naziv",
    "uplatilac_adresa",
    "uplatilac_mesto",
  ]);
  const templates = result.templates.map((template) => ({
    ...template,
    data: Object.fromEntries(
      Object.entries(template.data).filter(([key]) => !payerFields.has(key)),
    ),
  }));

  if (JSON.stringify(templates) !== JSON.stringify(result.templates)) {
    await saveTemplates(templates);
  }
  return templates;
}

async function saveTemplates(templates) {
  await chrome.storage.local.set({ templates });
}

function renderTemplateList(templates) {
  templateList.replaceChildren();
  emptyState.hidden = templates.length > 0;

  templates.forEach((template) => {
    const card = document.createElement("article");
    card.className = "template-card";
    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.textContent = template.name;
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Obriši";
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Da li ste sigurni da želite da obrišete šablon "${template.name}"?`,
      );

      if (!confirmed) return;

      const currentTemplates = await getTemplates();
      await saveTemplates(
        currentTemplates.filter((item) => item.id !== template.id),
      );
      renderTemplateList(await getTemplates());
    });
    const insertButton = document.createElement("button");
    insertButton.className = "insert-button";
    insertButton.type = "button";
    insertButton.textContent = "Ubaci";
    insertButton.addEventListener("click", () => insertTemplate(template.data));
    header.append(title, deleteButton);
    const details = document.createElement("div");
    details.className = "template-details";
    details.innerHTML = `<span>Račun primaoca</span><strong></strong><span>Primalac</span><strong></strong>`;
    details.querySelectorAll("strong")[0].textContent =
      template.data.racun_primaoca || "-";
    details.querySelectorAll("strong")[1].textContent =
      template.data.primalac_naziv || "-";
    card.append(header, details, insertButton);
    templateList.append(card);
  });
}

async function insertTemplate(paymentDetails) {
  if (!targetTabId) {
    setPageStatus("Aktivna stranica nije pronađena.", true);
    return;
  }

  const message = { type: "fillPaymentForm", paymentDetails };
  const finishInsert = (fillResult) => {
    if (fillResult.error) {
      setPageStatus(fillResult.error, true);
      return;
    }

    setPageStatus(`Popunjeno polja: ${fillResult.filled.length}.`);
    window.close();
  };

  try {
    const fillResult = await chrome.tabs.sendMessage(targetTabId, message);
    finishInsert(fillResult);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ["content.js"],
      });
      const fillResult = await chrome.tabs.sendMessage(targetTabId, message);
      finishInsert(fillResult);
    } catch (error) {
      console.error("Template insertion failed", { firstError, error });
      setPageStatus("Nije moguće pristupiti aktivnoj stranici.", true);
    }
  }
}

newTemplateButton.addEventListener("click", () => {
  templateForm.hidden = false;
  templateName.focus();
});

cancelButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Da li ste sigurni da želite da otkažete kreiranje šablona? Sve unete izmene biće izgubljene.",
  );

  if (!confirmed) return;

  templateForm.reset();
  templateForm.hidden = true;
  setFormStatus("");
});

document.getElementById("back-button").addEventListener("click", () => {
  window.location.href = "popup.html";
});

templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = {};
  new FormData(templateForm).forEach((value, key) => {
    if (key !== "template-name" && value !== "") {
      data[key] = key === "iznos" ? Number(value) : value;
    }
  });

  const templates = await getTemplates();
  templates.unshift({
    id: crypto.randomUUID(),
    name: templateName.value.trim(),
    data,
  });
  await saveTemplates(templates);
  renderTemplateList(templates);
  templateForm.reset();
  templateForm.hidden = true;
  setFormStatus("");
});

renderFields();
getTemplates().then(renderTemplateList);
