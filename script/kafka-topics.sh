docker exec omniscience_kafka_1 /opt/kafka_2.11-0.10.1.0/bin/kafka-topics.sh \
  --zookeeper zookeeper:2181 $@
