Run the tests like this:

```sh
NODE_TLS_REJECT_UNAUTHORIZED=0 \
PG=postgres://user:pass@host.us-east-1.rds.amazonaws.com/db?ssl=true \
node -r esm test
```