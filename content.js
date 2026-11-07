const fieldIds = {
  uplatilac_naziv: "debtorName",
  uplatilac_adresa: "debtorAddress",
  uplatilac_mesto: "debtorCity",
  sifra_uplate: "purposeCode",
  iznos: "amountTrans",
  svrha_uplate: "paymentPurpose",
  racun_primaoca: "benefificiarAccount",
  model: "beneficarModul",
  poziv_na_broj: "beneficiarReference",
  primalac_naziv: "beneficiarName",
  primalac_adresa: "beneficiarAddress",
  primalac_mesto: "beneficiarCity",
};

function setFieldValue(field, value) {
  const input = document.getElementById(field);
  if (!input || value === null || value === undefined) {
    return false;
  }

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  valueSetter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillPaymentForm(paymentDetails) {
  const filled = [];
  const missing = [];

  Object.entries(fieldIds).forEach(([field, inputId]) => {
    if (paymentDetails[field] === null || paymentDetails[field] === undefined) {
      return;
    }

    if (setFieldValue(inputId, paymentDetails[field])) {
      filled.push(field);
    } else {
      missing.push({ field, inputId });
    }
  });

  return { filled, missing };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "fillPaymentForm") {
    return;
  }

  sendResponse(fillPaymentForm(message.paymentDetails));
});
