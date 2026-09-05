# Questions for thomasluizon/orbit-tickets#421

## Tier-shaped price-loading skeleton

`design/canvas/Orbit Pro.dc.html:79` and `:175` draw a settings skeleton with three
rows and a 200px editor hint. They do not draw a tier-shaped skeleton or specify
its internal blocks, their widths and heights, or a height reservation for annual,
monthly and coupon content. The loaded cards are content-sized, so their roughly
260px height does not specify the missing loading geometry.

What geometry should a tier-shaped skeleton use? Retain the drawn three settings
rows per tier until a tier skeleton is granted. The specified type pairs are
implemented independently on web and mobile.
