import QRCode from "qrcode";

export async function renderPairingQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256
  });
}
