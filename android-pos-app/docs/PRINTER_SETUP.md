# Printer Setup

WholesalePOS generates PDF receipts at 58 mm or 80 mm width. Set the width under
**Settings**, open a completed sale, and choose receipt print/share. Completing a
sale never depends on a printer.

## Android print path

1. Pair a Bluetooth printer in Android settings when the printer exposes a
   supported system profile.
2. Install or enable the printer manufacturer's Android print service when
   required.
3. Generate the receipt PDF in WholesalePOS.
4. Choose the Android print service, save the PDF, or share it to the printer's
   application.
5. Print a test receipt and check margins before live use.

Direct raw Bluetooth ESC/POS is not included in this release. Printer-specific
SDK support can be added later behind the existing `ReceiptPrinter` interface.
Test each printer model, paper width, character set, cutter, and cash-drawer
behavior on physical hardware.
