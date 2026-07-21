// SupCod3 Dental — white-label seam. All product identity routes through here
// so per-clinic branding becomes a config swap in a later pass.
// NOTE: this is the PRODUCT name; the per-tenant clinic name lives in
// orgSettings.name and is rendered ALONGSIDE this, never replaced.
export const BRAND = {
  appName: 'SupCod3 Dental',
  vendorTagline: 'by SupCod3',
  marks: {
    white: '/brand/sc-mark-white.png', // navy header / dark surfaces
    navy:  '/brand/sc-mark-navy.png',  // white / light surfaces, print
    teal:  '/brand/sc-mark-teal.png',  // light surfaces where teal has contrast
  },
  favicons: {
    16: '/brand/favicon-16.png', 32: '/brand/favicon-32.png',
    48: '/brand/favicon-48.png', apple: '/brand/apple-touch-180.png',
    app: '/brand/app-icon-512.png',
  },
}
