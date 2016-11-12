docker exec omniscience_kafka_1 /opt/kafka_2.11-0.10.1.0/bin/kafka-topics.sh \
  --zookeeper zookeeper:2181 \
  --create \
  --topic githubRepositories \
  --partitions 1 \
  --replication-factor 1 \
  --config retention.ms=9223372036854775807 \
  --config retention.bytes=-1

docker exec omniscience_kafka_1 /opt/kafka_2.11-0.10.1.0/bin/kafka-topics.sh \
  --zookeeper zookeeper:2181 \
  --create \
  --topic pivotalBoards \
  --partitions 1 \
  --replication-factor 1 \
  --config retention.ms=9223372036854775807 \
  --config retention.bytes=-1

docker exec omniscience_kafka_1 /opt/kafka_2.11-0.10.1.0/bin/kafka-topics.sh \
  --zookeeper zookeeper:2181 \
  --create \
  --topic githubEvents \
  --partitions 1 \
  --replication-factor 1 \
  --config retention.ms=9223372036854775807 \
  --config retention.bytes=-1

docker exec omniscience_kafka_1 /opt/kafka_2.11-0.10.1.0/bin/kafka-topics.sh \
  --zookeeper zookeeper:2181 \
  --create \
  --topic pushEventAnnotations \
  --partitions 1 \
  --replication-factor 1 \
  --config retention.ms=9223372036854775807 \
  --config retention.bytes=-1
