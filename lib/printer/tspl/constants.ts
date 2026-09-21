/** Static content printed on every product label. */
export const STORE = {
  packersRegn: "544/DEL/EAST/HQ/2003",
  name: "MADHAV DEPARTMENTAL STORE",
  address1: "30-B, WEST VINOD NAGAR, GALI NO-7",
  address2: "I.P EXTENSION, DELHI-110092",
  customerCareNo: "011-47158021",
  customerCareEmail: "deepagg1234@gmail.com",
} as const;

/** Label canvas geometry at 203 DPI (600x400 px ≈ 75x50 mm). */
export const LABEL = {
  width: 600,
  height: 400,
  leftMargin: 10,
  rightMargin: 20,
  topMargin: 20,
} as const;

/** TSPL commands that initialize each print job. */
export const TSPL_SETUP = "SIZE 75 mm, 50 mm\r\nGAP 3 mm, 0 mm\r\nDIRECTION 1\r\n";

/** Canvas fonts mirroring the Python reference implementation. */
export const TSPL_FONTS = {
  small: 'bold 20px Arial, "Helvetica Neue", sans-serif',
  email: 'bold 22px Arial, "Helvetica Neue", sans-serif',
  medium: 'bold 24px Arial, "Helvetica Neue", sans-serif',
  bold: 'bold 26px Arial, "Helvetica Neue", sans-serif',
  title: 'bold 32px Arial, "Helvetica Neue", sans-serif',
} as const;
