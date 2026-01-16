#!/bin/sh

if [ "$SEPARATE_HEALTH_APP" = "1" ]; then
    # Ensure prisma client is generated for the current architecture
    prisma generate
    
    # Run prisma db push to sync schema with DB (automates migration)
    prisma db push --accept-data-loss
    
    export LITELLM_ARGS="$@"
    exec supervisord -c /etc/supervisord.conf
fi

if [ "$USE_DDTRACE" = "true" ]; then
    export DD_TRACE_OPENAI_ENABLED="False"
    exec ddtrace-run litellm "$@"
else
    # Ensure prisma client is generated for the current architecture
    prisma generate

    # Run prisma db push to sync schema with DB (automates migration)
    prisma db push --accept-data-loss

    exec litellm "$@"
fi