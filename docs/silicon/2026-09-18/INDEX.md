# 2026-09-18 on the card: the logs

The U50 with cft-fp256's revision-6 images, the single tile, the patched
library of 2026-09-17 (`backend_xrt-status-range-and-mask.diff`). What each
file is:

| file | what |
|---|---|
| `rate-compare-single.log` | `tools/silicon/rate-compare.sh single`: the card-day images and today's, back to back, on the same cases |
| `cmp-rate-single.jsonl` | the card-day images (17331ea), nine positives at 65,536 lanes, one record a case |
| `cmp-rate-new-single.jsonl` | today's images, the same streams and expected deposits by link |
| `rate-rule30-sw.jsonl` | `rule30`'s expected deposits at 4,096 lanes, made on the software backend from the card-day image, 32 processes |
| `cmp-rule30-old-single.jsonl`, `cmp-rule30-new-single.jsonl` | `rule30` on the card, card-day image and today's, both held to those deposits |
| `photo-hopf-512-single.log` | `tools/silicon/photo.sh`: the photograph, four passes of 1,048,576 samples, each pass's deposit buffer against the GPU's records |
| `photo-rate-single.jsonl` | the photograph's pass 0 timed alone on the clock, and as eight contiguous blocks |

`docs/CFT-SILICON.md` ("The lowering, priced, on the card") and
`docs/CFT-PHOTOGRAPH.md` are what these say.
