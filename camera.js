const camera = document.querySelector("#camera");
let stream;

async function keepCameraReady() {
  if (stream?.active) {
    return;
  }

  stream = await navigator.mediaDevices.getUserMedia({ video: true });
  camera.srcObject = stream;
}

keepCameraReady().catch((error) => {
  console.error("Persistent camera failed", error);
});
