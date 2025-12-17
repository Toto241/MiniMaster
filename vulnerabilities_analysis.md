# Dependabot Vulnerabilities Analysis - December 17, 2025

## Summary
27 Open vulnerabilities detected in Maven dependencies (Gradle/Android)

## High Severity (10)

| # | Package | Vulnerability |
|---|---------|---------------|
| 34 | com.google.protobuf:protobuf-kotlin | Potential Denial of Service issue |
| 33 | com.google.protobuf:protobuf-javalite | Potential Denial of Service issue |
| 21 | com.google.protobuf:protobuf-java | Potential Denial of Service issue |
| 48 | com.squareup.okhttp3:okhttp | Can accept the wrong certificate |
| 39 | org.jdom:jdom2 | XML External Entity (XXE) Injection |
| 25 | io.netty:netty-codec-http2 | MadeYouReset HTTP/2 DDoS vulnerability |
| 37 | io.netty:netty-handler | SslHandler native crash |
| 32 | ch.qos.logback:logback-core | Serialization vulnerability |
| 31 | ch.qos.logback:logback-classic | Serialization vulnerability |
| 10 | io.netty:netty-codec-http2 | HTTP/2 Rapid Reset Attack |

## Moderate Severity (14)

| # | Package | Vulnerability |
|---|---------|---------------|
| 8 | io.netty:netty-handler | SniHandler 16MB allocation |
| 14 | org.apache.commons:commons-compress | OutOfMemoryError unpacking Pack200 |
| 27 | io.netty:netty-codec | Various issues |
| 59 | io.netty:netty-codec-http | Various issues |
| 30 | com.squareup.okio:okio-jvm | Various issues |
| 29 | com.squareup.okio:okio | Various issues |
| 28 | com.squareup.okio:okio | Various issues |
| 35 | ch.qos.logback:logback-core | Various issues |
| 41 | ch.qos.logback:logback-core | Various issues |
| 15 | org.apache.commons:commons-compress | Various issues |
| 12 | com.google.guava:guava | Various issues |
| 24 | io.netty:netty-common | Various issues |
| 17 | io.netty:netty-codec-http | Various issues |
| 23 | io.netty:netty-common | Various issues |

## Low Severity (3)

| # | Package | Vulnerability |
|---|---------|---------------|
| 13 | com.google.guava:guava | Various issues |

## Required Updates in build.gradle

These are transitive dependencies from Firebase and other libraries. 
The resolutionStrategy in build.gradle needs to force newer versions.
