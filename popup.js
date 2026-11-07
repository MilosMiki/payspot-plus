const camera = document.querySelector("#camera");
const canvas = document.querySelector("#frame");
const cameraPickerButton = document.querySelector("#camera-picker-button");
const cameraMenu = document.querySelector("#camera-menu");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const backButton = document.querySelector("#back-button");
const statusMessage = document.querySelector("#status");
const result = document.querySelector("#result");
const context = canvas.getContext("2d", { willReadFrequently: true });
const validationUrl = "https://nbs.rs/QRcode/api/qr/v1/validate";
const targetTabId = Number(
  new URLSearchParams(window.location.search).get("targetTabId"),
);

let stream;
let scanTimer;
let validationStarted = false;
let candidateQrText;
let candidateQrFrames = 0;
let selectedDeviceId = "";

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function setResult(value) {
  if (result) {
    result.textContent = value;
  }
  console.log("Payment details:", value);
}

function splitParty(value) {
  const lines =
    typeof value === "string"
      ? value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  const secondLineIsAddress = lines.length === 2 && /\d/.test(lines[1]);

  return {
    name: lines[0] ?? null,
    address:
      lines.length >= 3 || secondLineIsAddress ? (lines[1] ?? null) : null,
    city:
      lines.length >= 3
        ? (lines[2] ?? null)
        : secondLineIsAddress
          ? null
          : (lines[1] ?? null),
  };
}

function parseAmount(value) {
  if (typeof value !== "string" || !value.startsWith("RSD")) {
    return null;
  }

  const amount = Number(value.slice(3).replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function buildPaymentDetails(tags) {
  const payer = splitParty(tags.P);
  const recipient = splitParty(tags.N);
  const reference = typeof tags.RO === "string" ? tags.RO : null;

  return {
    uplatilac_naziv: payer.name,
    uplatilac_adresa: payer.address,
    uplatilac_mesto: payer.city,
    sifra_uplate: tags.SF ?? null,
    iznos: parseAmount(tags.I),
    svrha_uplate: tags.S ?? null,
    racun_primaoca: tags.R ?? null,
    model: reference ? reference.slice(0, 2) : null,
    poziv_na_broj: reference ? reference.slice(2) || null : null,
    primalac_naziv: recipient.name,
    primalac_adresa: recipient.address,
    primalac_mesto: recipient.city,
  };
}

async function fillActiveTab(paymentDetails) {
  const tab = targetTabId
    ? await chrome.tabs.get(targetTabId)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

  if (!tab?.id) {
    return {
      filled: [],
      missing: [],
      error: "Aktivna stranica nije pronađena.",
    };
  }

  const message = {
    type: "fillPaymentForm",
    paymentDetails,
  };

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (secondError) {
      console.error("Could not inject payment form filler", {
        firstError,
        secondError,
      });
      return {
        filled: [],
        missing: [],
        error:
          "Nije moguće pristupiti aktivnoj stranici. Osvežite stranicu ili dozvolite pristup ekstenziji.",
        details: secondError.message,
      };
    }
  }
}

async function validateQrText(qrText) {
  setStatus("QR kod je pronađen. Provera podataka u toku...");

  try {
    const response = await fetch(validationUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain",
      },
      body: qrText,
    });
    const responseText = await response.text();
    let responseValue = responseText;
    let fillMessage;

    try {
      const apiResponse = JSON.parse(responseText);
      if (apiResponse.n) {
        const paymentDetails = buildPaymentDetails(apiResponse.n);
        responseValue = JSON.stringify(paymentDetails, null, 2);
        const fillResult = await fillActiveTab(paymentDetails);
        if (fillResult.error) {
          fillMessage = { message: fillResult.error, isError: true };
        } else {
          fillMessage = {
            message: `Popunjeno polja: ${fillResult.filled.length}.`,
            isError: false,
          };
        }
      } else {
        responseValue = JSON.stringify(apiResponse, null, 2);
      }
    } catch {}

    setResult(responseValue);
    if (fillMessage) {
      setStatus(fillMessage.message, fillMessage.isError);
    } else {
      setStatus(
        response.ok
          ? "Podaci su provereni u NBS sistemu."
          : `NBS je vratio HTTP ${response.status}.`,
        !response.ok,
      );
    }
  } catch (error) {
    setStatus(
      `Greška pri proveri podataka (${error.name}): ${error.message}`,
      true,
    );
    console.error("NBS validation request failed", error);
  } finally {
    window.close();
  }
}

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    cameraMenu.replaceChildren();

    if (cameras.length === 0) {
      const option = document.createElement("option");
      option.textContent = "Podrazumevana kamera (dozvolite pristup)";
      cameraPickerButton.textContent = option.textContent;
      return cameras;
    }

    cameras.forEach((device, index) => {
      const option = document.createElement("button");
      option.className = "camera-option";
      option.type = "button";
      option.dataset.deviceId = device.deviceId;
      option.textContent = device.label || `Kamera ${index + 1}`;
      option.addEventListener("click", () => {
        selectedDeviceId = device.deviceId;
        cameraPickerButton.textContent = option.textContent;
        cameraMenu.hidden = true;
        cameraPickerButton.setAttribute("aria-expanded", "false");
        startCamera(selectedDeviceId);
      });
      cameraMenu.append(option);
    });

    const selectedDevice = cameras.find(
      (device) => device.deviceId === selectedDeviceId,
    );
    if (selectedDevice) {
      cameraPickerButton.textContent = selectedDevice.label || "Kamera";
    }
    return cameras;
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function getCameraPermissionState() {
  try {
    const permission = await navigator.permissions.query({ name: "camera" });
    return permission.state;
  } catch {
    return "unknown";
  }
}

async function startCamera(deviceId) {
  stopCamera();
  validationStarted = false;
  candidateQrText = undefined;
  candidateQrFrames = 0;
  cameraPlaceholder.hidden = true;

  try {
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    selectedDeviceId =
      stream.getVideoTracks()[0].getSettings().deviceId || deviceId;
    camera.srcObject = stream;
    cameraPlaceholder.hidden = true;
    setStatus("Skeniranje traje dok se ne pronađe QR kod...");
    getCameras();
    scanTimer = window.setInterval(scanFrame, 180);
  } catch (error) {
    cameraPlaceholder.hidden = false;
    await getCameras();
    const permissionState = await getCameraPermissionState();
    if (error.name === "NotAllowedError" && permissionState === "denied") {
      setStatus(
        "Chrome blokira kameru. Otvorite chrome://settings/content/camera, uklonite blokadu i pokušajte ponovo.",
        true,
      );
    } else if (error.name === "NotAllowedError") {
      setStatus(
        "Pristup kameri nije dozvoljen. Pokušajte ponovo i izaberite Dozvoli u Chrome-u.",
        true,
      );
    } else {
      setStatus(`Greška kamere (${error.name}): ${error.message}`, true);
    }
    console.error("Camera start failed", {
      name: error.name,
      message: error.message,
      permissionState,
      constraint: constraints,
    });
  }
}

function stopCamera() {
  if (scanTimer) {
    window.clearInterval(scanTimer);
    scanTimer = undefined;
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  camera.srcObject = null;
  cameraPlaceholder.hidden = false;
  candidateQrText = undefined;
  candidateQrFrames = 0;
}

async function scanFrame() {
  if (
    !stream ||
    camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    camera.videoWidth === 0
  ) {
    return;
  }

  canvas.width = camera.videoWidth;
  canvas.height = camera.videoHeight;
  context.drawImage(camera, 0, 0, canvas.width, canvas.height);

  try {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(
      imageData.data,
      imageData.width,
      imageData.height,
      { inversionAttempts: "attemptBoth" },
    );
    if (code && !validationStarted) {
      if (code.data === candidateQrText) {
        candidateQrFrames += 1;
      } else {
        candidateQrText = code.data;
        candidateQrFrames = 1;
      }

      if (candidateQrFrames < 2) {
        return;
      }

      validationStarted = true;
      if (scanTimer) {
        window.clearInterval(scanTimer);
        scanTimer = undefined;
      }
      await validateQrText(code.data);
    } else if (!code) {
      candidateQrText = undefined;
      candidateQrFrames = 0;
    }
  } catch (error) {
    setStatus(`Greška pri skeniranju: ${error.message}`, true);
    console.error(error);
  }
}

backButton.addEventListener("click", () => window.close());
cameraPickerButton.addEventListener("click", (event) => {
  event.stopPropagation();
  cameraMenu.hidden = !cameraMenu.hidden;
  cameraPickerButton.setAttribute("aria-expanded", String(!cameraMenu.hidden));
});
document.addEventListener("click", () => {
  cameraMenu.hidden = true;
  cameraPickerButton.setAttribute("aria-expanded", "false");
});

if (typeof window.jsQR !== "function") {
  setStatus(
    "QR dekoder nedostaje. Pokrenite npm install u ovom folderu.",
    true,
  );
} else if (!navigator.mediaDevices?.getUserMedia) {
  setStatus("Pristup kameri nije dostupan u ovom kontekstu.", true);
} else {
  startCamera(selectedDeviceId);
  getCameras();
}

window.addEventListener("unload", stopCamera);
