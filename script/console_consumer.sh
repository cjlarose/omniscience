docker exec omniscience_kafka_1 /opt/kafka_2.11-0.10.0.1/bin/kafka-console-consumer.sh \
  --zookeeper zookeeper:2181 $@
